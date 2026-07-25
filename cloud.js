"use strict";

window.BoxCloud = (() => {
  const config = window.BOX_SUPABASE_CONFIG || {};
  const configured =
    typeof config.url === "string" &&
    config.url.startsWith("https://") &&
    typeof config.publishableKey === "string" &&
    !config.publishableKey.startsWith("PASTE_");

  const client = configured && window.supabase
    ? window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  let session = null;
  let syncing = false;
  let collectionTimers = {};
  let noteTimer = null;

  const DOCUMENT_BUCKET = "box-documents";
  const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024;

  function emit(state, label) {
    window.dispatchEvent(new CustomEvent("boxcloudstatus", {
      detail: { state, label, session }
    }));
  }

  function isConfigured() {
    return configured;
  }

  function isReady() {
    return Boolean(client && session?.user);
  }

  async function signIn(email, password) {
    if (!client) return { error: new Error("Supabase is not configured.") };
    return client.auth.signInWithPassword({ email, password });
  }

  async function signUp(email, password) {
    if (!client) return { error: new Error("Supabase is not configured.") };
    return client.auth.signUp({ email, password });
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  function toCloudRows(items) {
    return items.map((item) => ({
      id: String(item.id),
      user_id: session.user.id,
      payload: item,
      updated_at: new Date().toISOString()
    }));
  }

  async function replaceCollection(table, items) {
    if (!isReady()) return { error: null };

    emit("syncing", "Syncing");

    const { error: deleteError } = await client
      .from(table)
      .delete()
      .eq("user_id", session.user.id);

    if (deleteError) {
      emit("error", "Sync error");
      return { error: deleteError };
    }

    if (items.length) {
      const { error: insertError } = await client
        .from(table)
        .insert(toCloudRows(items));

      if (insertError) {
        emit("error", "Sync error");
        return { error: insertError };
      }
    }

    emit("online", "Synced");
    return { error: null };
  }

  function queueCollectionSync(table, items) {
    clearTimeout(collectionTimers[table]);
    collectionTimers[table] = setTimeout(() => {
      replaceCollection(table, items);
    }, 700);
  }

  async function saveNote(text) {
    if (!isReady()) return { error: null };

    const { error } = await client
      .from("notes")
      .upsert({
        user_id: session.user.id,
        content: text,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

    emit(error ? "error" : "online", error ? "Sync error" : "Synced");
    return { error };
  }

  function queueNoteSync(text) {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => saveNote(text), 700);
  }

  function createUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  function sanitizeFileName(name) {
    const clean = String(name || "document")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._ -]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(-140);

    return clean || "document";
  }

  function normalizeExpiryDate(value) {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function normalizeReminderDays(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(365, Math.max(0, Math.round(number))) : 30;
  }

  function normalizeDocumentTags(value) {
    const raw = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    return raw
      .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 40))
      .filter((item) => {
        if (!item) return false;
        const key = item.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  }

  function normalizeLinkIds(value) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set();
    return raw
      .map((item) => String(item ?? "").trim().slice(0, 100))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .slice(0, 100);
  }

  const DOCUMENT_SELECT = "id,name,storage_path,folder,details,mime_type,size_bytes,is_favorite,deleted_at,expiry_date,reminder_days,tags,linked_task_ids,linked_event_ids,current_version,current_version_note,created_at,updated_at";
  const VERSION_SELECT = "id,document_id,storage_path,name,mime_type,size_bytes,version_number,notes,created_at";

  async function listDocuments() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access documents.") };

    const { data, error } = await client
      .from("documents")
      .select(DOCUMENT_SELECT)
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    return { data: data || [], error };
  }

  async function uploadDocument(file, folder, details = "", compliance = {}) {
    if (!isReady()) return { data: null, error: new Error("Sign in before uploading documents.") };
    if (!(file instanceof File)) return { data: null, error: new Error("Choose a valid file.") };
    if (file.size > MAX_DOCUMENT_SIZE) {
      return { data: null, error: new Error(`${file.name} is larger than 25 MB.`) };
    }

    const documentId = createUuid();
    const safeName = sanitizeFileName(file.name);
    const storagePath = `${session.user.id}/${documentId}-${safeName}`;

    emit("syncing", "Uploading");

    const uploadOptions = {
      cacheControl: "3600",
      upsert: false
    };

    if (file.type) uploadOptions.contentType = file.type;

    const { error: uploadError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, file, uploadOptions);

    if (uploadError) {
      emit("error", "Upload error");
      return { data: null, error: uploadError };
    }

    const { data, error: metadataError } = await client
      .from("documents")
      .insert({
        id: documentId,
        user_id: session.user.id,
        name: file.name,
        storage_path: storagePath,
        folder: String(folder || "Personal").trim().slice(0, 60) || "Personal",
        details: String(details || "").trim().slice(0, 2000) || null,
        expiry_date: normalizeExpiryDate(compliance.expiryDate),
        reminder_days: normalizeReminderDays(compliance.reminderDays),
        tags: normalizeDocumentTags(compliance.tags),
        linked_task_ids: [],
        linked_event_ids: [],
        current_version: 1,
        current_version_note: null,
        mime_type: file.type || null,
        size_bytes: file.size,
        is_favorite: false,
        updated_at: new Date().toISOString()
      })
      .select(DOCUMENT_SELECT)
      .single();

    if (metadataError) {
      await client.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
      emit("error", "Upload error");
      return { data: null, error: metadataError };
    }

    emit("online", "Synced");
    return { data, error: null };
  }

  async function listDocumentFolders() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access document folders.") };

    const { data, error } = await client
      .from("document_folders")
      .select("id,name,created_at,updated_at")
      .eq("user_id", session.user.id)
      .order("name", { ascending: true });

    return { data: data || [], error };
  }

  async function createDocumentFolder(name) {
    if (!isReady()) return { data: null, error: new Error("Sign in before creating a folder.") };

    const cleanName = String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);

    if (!cleanName) {
      return { data: null, error: new Error("Enter a folder name.") };
    }

    const { data, error } = await client
      .from("document_folders")
      .insert({
        user_id: session.user.id,
        name: cleanName,
        updated_at: new Date().toISOString()
      })
      .select("id,name,created_at,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Folder error" : "Synced");
    return { data, error };
  }

  async function updateDocumentMetadata(documentId, metadata = {}) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    const cleanDetails = String(metadata.details || "").trim().slice(0, 2000);
    const { data, error } = await client
      .from("documents")
      .update({
        details: cleanDetails || null,
        expiry_date: normalizeExpiryDate(metadata.expiryDate),
        reminder_days: normalizeReminderDays(metadata.reminderDays),
        tags: normalizeDocumentTags(metadata.tags),
        linked_task_ids: normalizeLinkIds(metadata.linkedTaskIds),
        linked_event_ids: normalizeLinkIds(metadata.linkedEventIds),
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId)
      .eq("user_id", session.user.id)
      .select("id,details,expiry_date,reminder_days,tags,linked_task_ids,linked_event_ids,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Sync error" : "Synced");
    return { data, error };
  }

  async function listDocumentVersions(documentId) {
    if (!isReady()) return { data: [], error: new Error("Sign in first.") };

    const { data, error } = await client
      .from("document_versions")
      .select(VERSION_SELECT)
      .eq("user_id", session.user.id)
      .eq("document_id", documentId)
      .order("version_number", { ascending: false });

    return { data: data || [], error };
  }

  async function createDocumentVersion(documentItem, file, notes = "") {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };
    if (!documentItem?.id || !documentItem?.storage_path) {
      return { data: null, error: new Error("The current document could not be identified.") };
    }
    if (!(file instanceof File)) return { data: null, error: new Error("Choose a valid replacement file.") };
    if (file.size > MAX_DOCUMENT_SIZE) {
      return { data: null, error: new Error(`${file.name} is larger than 25 MB.`) };
    }

    const currentVersion = Math.max(1, Number(documentItem.current_version || 1));
    const nextVersion = currentVersion + 1;
    const versionId = createUuid();
    const safeName = sanitizeFileName(file.name);
    const newStoragePath = `${session.user.id}/${documentItem.id}-v${nextVersion}-${versionId}-${safeName}`;
    const now = new Date().toISOString();

    emit("syncing", "Uploading version");

    const uploadOptions = { cacheControl: "3600", upsert: false };
    if (file.type) uploadOptions.contentType = file.type;

    const { error: uploadError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .upload(newStoragePath, file, uploadOptions);

    if (uploadError) {
      emit("error", "Version error");
      return { data: null, error: uploadError };
    }

    const { data: archivedVersion, error: archiveError } = await client
      .from("document_versions")
      .insert({
        user_id: session.user.id,
        document_id: documentItem.id,
        storage_path: documentItem.storage_path,
        name: documentItem.name,
        mime_type: documentItem.mime_type || null,
        size_bytes: Number(documentItem.size_bytes || 0),
        version_number: currentVersion,
        notes: String(documentItem.current_version_note || "").trim().slice(0, 500) || null
      })
      .select(VERSION_SELECT)
      .single();

    if (archiveError) {
      await client.storage.from(DOCUMENT_BUCKET).remove([newStoragePath]);
      emit("error", "Version error");
      return { data: null, error: archiveError };
    }

    const { data: updatedDocument, error: updateError } = await client
      .from("documents")
      .update({
        name: file.name,
        storage_path: newStoragePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        current_version: nextVersion,
        current_version_note: String(notes || "").trim().slice(0, 500) || null,
        updated_at: now
      })
      .eq("id", documentItem.id)
      .eq("user_id", session.user.id)
      .select(DOCUMENT_SELECT)
      .single();

    if (updateError) {
      await client.from("document_versions").delete().eq("id", archivedVersion.id).eq("user_id", session.user.id);
      await client.storage.from(DOCUMENT_BUCKET).remove([newStoragePath]);
      emit("error", "Version error");
      return { data: null, error: updateError };
    }

    emit("online", "Synced");
    return { data: { document: updatedDocument, archivedVersion }, error: null };
  }

  async function restoreDocumentVersion(documentItem, versionItem) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };
    if (!versionItem?.storage_path) return { data: null, error: new Error("The selected version could not be found.") };

    emit("syncing", "Restoring version");
    const { data: blob, error: downloadError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .download(versionItem.storage_path);

    if (downloadError || !blob) {
      emit("error", "Restore error");
      return { data: null, error: downloadError || new Error("The selected version could not be downloaded.") };
    }

    const restoredFile = new File([blob], versionItem.name || documentItem.name, {
      type: versionItem.mime_type || blob.type || "application/octet-stream",
      lastModified: Date.now()
    });

    return createDocumentVersion(
      documentItem,
      restoredFile,
      `Restored from version ${versionItem.version_number}`
    );
  }

  async function setDocumentFavorite(documentId, isFavorite) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    const { data, error } = await client
      .from("documents")
      .update({
        is_favorite: Boolean(isFavorite),
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId)
      .eq("user_id", session.user.id)
      .select("id,is_favorite,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Sync error" : "Synced");
    return { data, error };
  }

  async function createDocumentUrl(storagePath, expiresIn = 120) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    return client.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(storagePath, expiresIn);
  }

  async function downloadDocument(storagePath) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    return client.storage
      .from(DOCUMENT_BUCKET)
      .download(storagePath);
  }

  async function moveDocumentToTrash(documentId) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    const deletedAt = new Date().toISOString();
    const { data, error } = await client
      .from("documents")
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .eq("id", documentId)
      .eq("user_id", session.user.id)
      .select("id,deleted_at,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Recycle error" : "Synced");
    return { data, error };
  }

  async function restoreDocument(documentId) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    const { data, error } = await client
      .from("documents")
      .update({ deleted_at: null, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("user_id", session.user.id)
      .select("id,deleted_at,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Restore error" : "Synced");
    return { data, error };
  }

  async function permanentlyDeleteDocument(documentId, storagePath) {
    if (!isReady()) return { error: new Error("Sign in first.") };

    emit("syncing", "Deleting");

    const { data: versionRows, error: versionListError } = await client
      .from("document_versions")
      .select("storage_path")
      .eq("user_id", session.user.id)
      .eq("document_id", documentId);

    if (versionListError) {
      emit("error", "Delete error");
      return { error: versionListError };
    }

    const storagePaths = [...new Set([
      storagePath,
      ...(versionRows || []).map((item) => item.storage_path)
    ].filter(Boolean))];

    if (storagePaths.length) {
      const { error: storageError } = await client.storage
        .from(DOCUMENT_BUCKET)
        .remove(storagePaths);

      if (storageError) {
        emit("error", "Delete error");
        return { error: storageError };
      }
    }

    const { error: metadataError } = await client
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", session.user.id);

    emit(metadataError ? "error" : "online", metadataError ? "Delete error" : "Synced");
    return { error: metadataError };
  }


  const TEMPLATE_SELECT = "id,title,category,content,created_at,updated_at";

  async function listCustomTemplates() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access custom templates.") };

    const { data, error } = await client
      .from("custom_templates")
      .select(TEMPLATE_SELECT)
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    return { data: data || [], error };
  }

  async function saveCustomTemplate(template = {}) {
    if (!isReady()) return { data: null, error: new Error("Sign in to sync templates.") };

    const now = new Date().toISOString();
    const row = {
      id: String(template.id || createUuid()),
      user_id: session.user.id,
      title: String(template.title || "Untitled template").trim().slice(0, 120),
      category: String(template.category || "General").trim().slice(0, 50) || "General",
      content: String(template.content || "").slice(0, 250000),
      created_at: template.createdAt || template.created_at || now,
      updated_at: template.updatedAt || template.updated_at || now
    };

    const { data, error } = await client
      .from("custom_templates")
      .upsert(row, { onConflict: "id" })
      .select(TEMPLATE_SELECT)
      .single();

    emit(error ? "error" : "online", error ? "Template sync error" : "Synced");
    return { data, error };
  }

  async function deleteCustomTemplate(templateId) {
    if (!isReady()) return { error: new Error("Sign in to sync templates.") };

    const { error } = await client
      .from("custom_templates")
      .delete()
      .eq("id", String(templateId))
      .eq("user_id", session.user.id);

    emit(error ? "error" : "online", error ? "Template delete error" : "Synced");
    return { error };
  }

  async function replaceCustomTemplates(templates = []) {
    if (!isReady()) return { error: null };

    const { error: deleteError } = await client
      .from("custom_templates")
      .delete()
      .eq("user_id", session.user.id);

    if (deleteError) return { error: deleteError };

    const normalized = Array.isArray(templates) ? templates : [];
    if (!normalized.length) return { error: null };

    const now = new Date().toISOString();
    const rows = normalized.map((template) => ({
      id: String(template.id || createUuid()),
      user_id: session.user.id,
      title: String(template.title || "Untitled template").trim().slice(0, 120),
      category: String(template.category || "General").trim().slice(0, 50) || "General",
      content: String(template.content || "").slice(0, 250000),
      created_at: template.createdAt || template.created_at || now,
      updated_at: template.updatedAt || template.updated_at || now
    }));

    const { error } = await client.from("custom_templates").insert(rows);
    emit(error ? "error" : "online", error ? "Template sync error" : "Synced");
    return { error };
  }

  async function createBackupSnapshot() {
    if (!isReady()) {
      return {
        data: null,
        error: new Error("Sign in to include the cloud document inventory.")
      };
    }

    emit("syncing", "Preparing backup");

    const [documentsResult, foldersResult, versionsResult, templatesResult] = await Promise.all([
      client
        .from("documents")
        .select(DOCUMENT_SELECT)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
      client
        .from("document_folders")
        .select("id,name,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("name", { ascending: true }),
      client
        .from("document_versions")
        .select(VERSION_SELECT)
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),
      client
        .from("custom_templates")
        .select(TEMPLATE_SELECT)
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
    ]);

    const error = documentsResult.error || foldersResult.error || versionsResult.error || templatesResult.error;
    if (error) {
      emit("error", "Backup error");
      return { data: null, error };
    }

    emit("online", "Synced");
    return {
      data: {
        accountEmail: session.user.email || null,
        documents: documentsResult.data || [],
        documentFolders: foldersResult.data || [],
        documentVersions: versionsResult.data || [],
        customTemplates: templatesResult.data || [],
        includesFileContents: false
      },
      error: null
    };
  }

  async function fetchCollection(table) {
    const { data, error } = await client
      .from(table)
      .select("payload")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false });

    return {
      data: data ? data.map((row) => row.payload) : [],
      error
    };
  }

  async function hydrateFromCloud() {
    if (!isReady()) return { error: null };

    emit("syncing", "Loading");

    const [tasksResult, eventsResult, financeResult, noteResult, templatesResult] =
      await Promise.all([
        fetchCollection("tasks"),
        fetchCollection("events"),
        fetchCollection("finance_entries"),
        client.from("notes").select("content").eq("user_id", session.user.id).maybeSingle(),
        client
          .from("custom_templates")
          .select(TEMPLATE_SELECT)
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false })
      ]);

    const firstError =
      tasksResult.error ||
      eventsResult.error ||
      financeResult.error ||
      noteResult.error ||
      templatesResult.error;

    if (firstError) {
      emit("error", "Cloud error");
      return { error: firstError };
    }

    const cloudHasData =
      tasksResult.data.length ||
      eventsResult.data.length ||
      financeResult.data.length ||
      typeof noteResult.data?.content === "string" ||
      templatesResult.data?.length;

    if (cloudHasData && typeof window.BoxOSCloudHydrate === "function") {
      window.BoxOSCloudHydrate({
        tasks: tasksResult.data,
        events: eventsResult.data,
        finance_entries: financeResult.data,
        notes: noteResult.data?.content,
        custom_templates: templatesResult.data || []
      });
    } else {
      await syncNow();
    }

    emit("online", "Synced");
    return { error: null };
  }

  async function syncNow() {
    if (!isReady()) return { error: new Error("Sign in first.") };

    syncing = true;
    emit("syncing", "Syncing");

    try {
      const localTasks = JSON.parse(localStorage.getItem("theBoxOS4Tasks") || "[]");
      const localEvents = JSON.parse(localStorage.getItem("theBoxOS4Events") || "[]");
      const localFinance = JSON.parse(localStorage.getItem("theBoxOS4Finance") || "[]");
      const localNotes = localStorage.getItem("theBoxOS4Notes") || "";
      const localTemplates = JSON.parse(localStorage.getItem("theBoxOSCustomTemplates") || "[]");

      const results = await Promise.all([
        replaceCollection("tasks", localTasks),
        replaceCollection("events", localEvents),
        replaceCollection("finance_entries", localFinance),
        saveNote(localNotes),
        replaceCustomTemplates(localTemplates)
      ]);

      const failure = results.find((result) => result.error);
      emit(failure ? "error" : "online", failure ? "Sync error" : "Synced");
      return failure || { error: null };
    } finally {
      syncing = false;
    }
  }

  async function start() {
    if (!client) {
      emit("offline", "Local");
      return { session: null };
    }

    const { data } = await client.auth.getSession();
    session = data.session;
    emit(session ? "online" : "offline", session ? "Connected" : "Sign in");

    client.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      emit(session ? "online" : "offline", session ? "Connected" : "Sign in");

      if (session) {
        await hydrateFromCloud();
      }
    });

    if (session) {
      await hydrateFromCloud();
    }

    return { session };
  }

  return {
    start,
    isConfigured,
    isReady,
    signIn,
    signUp,
    signOut,
    syncNow,
    queueCollectionSync,
    queueNoteSync,
    listDocuments,
    listDocumentFolders,
    createDocumentFolder,
    uploadDocument,
    updateDocumentMetadata,
    listDocumentVersions,
    createDocumentVersion,
    restoreDocumentVersion,
    setDocumentFavorite,
    createDocumentUrl,
    downloadDocument,
    moveDocumentToTrash,
    restoreDocument,
    permanentlyDeleteDocument,
    createBackupSnapshot,
    listCustomTemplates,
    saveCustomTemplate,
    deleteCustomTemplate,
    replaceCustomTemplates
  };
})();