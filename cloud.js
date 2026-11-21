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
  let cloudHydrationSequence = 0;

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

  const TASKS = "theBoxOS4Tasks";
  const NOTES = "theBoxOS4Notes";
  const OWNER = "theBoxOSNotesOwnerId";
  const PENDING = "theBoxOSNotesPendingSync";
  let workspaceChain = Promise.resolve();
  let workspaceTimer;
  let lastTaskSnapshot = "";

  function taskQueueKey(owner) {
    return "theBoxTaskChanges:" + owner;
  }

  function recordTaskChanges(previous, items) {
    const owner = session?.user?.id || localStorage.getItem(OWNER) || "local";
    const changes = new Map(JSON.parse(localStorage.getItem(taskQueueKey(owner)) || "[]"));
    const before = new Map(previous.map(item => [String(item.id), item]));
    for (const item of items) {
      const id = String(item.id);
      if (JSON.stringify(before.get(id)) !== JSON.stringify(item)) changes.set(id, item);
      before.delete(id);
    }
    for (const id of before.keys()) changes.set(id, null);
    localStorage.setItem(taskQueueKey(owner), JSON.stringify([...changes]));
    queueWorkspaceSync();
  }

  async function syncTasks(owner, bootstrap) {
    const key = taskQueueKey(owner);
    const previousOwner = localStorage.getItem(OWNER);
    if (!previousOwner && localStorage.getItem(taskQueueKey("local"))) {
      const guest = JSON.parse(localStorage.getItem(taskQueueKey("local")));
      const account = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...new Map([...guest, ...account])]));
      localStorage.removeItem(taskQueueKey("local"));
    }
    if (bootstrap && !previousOwner) {
      const seed = JSON.parse(localStorage.getItem(TASKS) || "[]").map(item => [String(item.id), item]);
      localStorage.setItem(key, JSON.stringify([...new Map([...seed, ...JSON.parse(localStorage.getItem(key) || "[]")])]));
    }
    const pending = JSON.parse(localStorage.getItem(key) || "[]");
    for (const [id, payload] of pending) {
      if (session?.user?.id !== owner) return;
      const table = client.from("tasks");
      let result;
      if (payload === null) {
        result = await table.delete().eq("user_id", owner).eq("id", id);
      } else {
        const row = {payload, updated_at: new Date().toISOString()};
        result = await table.update(row).eq("user_id", owner).eq("id", id).select("id");
        if (!result.error && !result.data.length && session?.user?.id === owner) {
          result = await client.from("tasks").insert({...row, user_id: owner, id});
        }
      }
      if (result.error) throw result.error;
      const current = new Map(JSON.parse(localStorage.getItem(key) || "[]"));
      if (JSON.stringify(current.get(id)) === JSON.stringify(payload)) current.delete(id);
      localStorage.setItem(key, JSON.stringify([...current]));
    }
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      if (session?.user?.id !== owner) return;
      const {data, error} = await client.from("tasks").select("payload")
        .eq("user_id", owner).order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data.map(row => row.payload));
      if (data.length < 500) break;
    }
    if (session?.user?.id !== owner || JSON.parse(localStorage.getItem(key) || "[]").length) return;
    const snapshot = JSON.stringify([owner, rows]);
    if (pending.length || snapshot !== lastTaskSnapshot) {
      window.BoxOSCloudHydrate({tasks: rows});
      lastTaskSnapshot = snapshot;
    }
  }

  async function syncNotes(owner, bootstrap) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const {data, error} = await client.from("notes").select("content,updated_at")
        .eq("user_id", owner).maybeSingle();
      if (error) throw error;
      if (session?.user?.id !== owner) return;
      const stored = localStorage.getItem(NOTES) || "";
      const known = localStorage.getItem(OWNER);
      const pending = (!known || known === owner) && (localStorage.getItem(PENDING) === "1" || (bootstrap && !known && !data && stored));
      const remote = data?.content || "";
      if (!pending) {
        if (known !== owner || (data && stored !== remote)) {
          window.BoxOSCloudHydrate({notes: remote, notesUserId: owner});
        }
        return;
      }
      const merged = remote ? window.mergePendingNotesPayload(stored, remote) : stored;
      if (merged !== remote) {
        const previousTime = Date.parse(data?.updated_at) || 0;
        const row = {content: merged, updated_at: new Date(Math.max(Date.now(), previousTime + 1)).toISOString()};
        const result = data
          ? await client.from("notes").update(row).eq("user_id", owner)
              .eq("updated_at", data.updated_at).select("user_id")
          : await client.from("notes").insert({...row, user_id: owner});
        if (result.error?.code === "23505" || (data && !result.error && !result.data.length)) continue;
        if (result.error) throw result.error;
      }
      if (session?.user?.id !== owner || localStorage.getItem(NOTES) !== stored) return;
      localStorage.removeItem(PENDING);
      if (stored !== merged || known !== owner) window.BoxOSCloudHydrate({notes: merged, notesUserId: owner});
      window.dispatchEvent(new CustomEvent("boxcloudnotesaved", {detail: {content: merged, userId: owner}}));
      return;
    }
    throw new Error("Notes are changing on another device. Sync will retry.");
  }

  function syncWorkspace(bootstrap = false) {
    const owner = session?.user?.id;
    if (!owner) return Promise.resolve({error: null});
    workspaceChain = workspaceChain.catch(() => {}).then(async () => {
      if (session?.user?.id !== owner) return {error: null};
      const results = await Promise.allSettled([syncTasks(owner, bootstrap), syncNotes(owner, bootstrap)]);
      const failure = results.find(result => result.status === "rejected");
      if (session?.user?.id === owner) emit(failure ? "error" : "online", failure ? "Sync pending" : "Synced");
      return {error: failure?.reason || null};
    });
    return workspaceChain;
  }

  function queueWorkspaceSync() {
    clearTimeout(workspaceTimer);
    workspaceTimer = setTimeout(() => syncWorkspace(), 450);
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


  const JOURNAL_SELECT = "id,entry_date,entry_time,title,content,mood,tags,favorite,created_at,updated_at";

  function toJournalRow(entry = {}) {
    const now = new Date().toISOString();
    const timeValue = String(entry.entry_time || entry.entryTime || "").trim();
    return {
      id: String(entry.id || createUuid()),
      user_id: session.user.id,
      entry_date: String(entry.entry_date || entry.entryDate || now.slice(0, 10)).slice(0, 10),
      entry_time: /^\d{2}:\d{2}/.test(timeValue) ? timeValue.slice(0, 5) : null,
      title: String(entry.title || "").trim().slice(0, 180),
      content: String(entry.content || "").slice(0, 100000),
      mood: String(entry.mood || "").slice(0, 30),
      tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 20) : [],
      favorite: Boolean(entry.favorite),
      created_at: entry.created_at || entry.createdAt || now,
      updated_at: entry.updated_at || entry.updatedAt || now
    };
  }

  async function listJournalEntries() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access journal entries.") };
    const { data, error } = await client
      .from("journal_entries")
      .select(JOURNAL_SELECT)
      .eq("user_id", session.user.id)
      .order("entry_date", { ascending: false })
      .order("entry_time", { ascending: false, nullsFirst: false });
    return { data: data || [], error };
  }

  async function saveJournalEntry(entry = {}) {
    if (!isReady()) return { data: null, error: new Error("Sign in to sync journal entries.") };
    const row = toJournalRow(entry);
    row.updated_at = new Date().toISOString();
    const { data, error } = await client
      .from("journal_entries")
      .upsert(row, { onConflict: "id" })
      .select(JOURNAL_SELECT)
      .single();
    emit(error ? "error" : "online", error ? "Journal sync error" : "Synced");
    return { data, error };
  }

  async function deleteJournalEntry(entryId) {
    if (!isReady()) return { error: new Error("Sign in to sync journal entries.") };
    const { error } = await client
      .from("journal_entries")
      .delete()
      .eq("id", String(entryId))
      .eq("user_id", session.user.id);
    emit(error ? "error" : "online", error ? "Journal delete error" : "Synced");
    return { error };
  }

  async function replaceJournalEntries(entries = []) {
    if (!isReady()) return { error: null };
    const { error: deleteError } = await client
      .from("journal_entries")
      .delete()
      .eq("user_id", session.user.id);
    if (deleteError) return { error: deleteError };
    const rows = (Array.isArray(entries) ? entries : []).map(toJournalRow);
    if (!rows.length) return { error: null };
    const { error } = await client.from("journal_entries").insert(rows);
    emit(error ? "error" : "online", error ? "Journal sync error" : "Synced");
    return { error };
  }


  const OUR_SPACE_SELECT = "id,title,category,status,target_date,place,estimated_budget,notes,checklist,links,attachments,favorite,priority,actual_date,favorite_memory,actual_budget,rating,created_at,updated_at";

  function toOurSpaceRow(plan = {}) {
    const now = new Date().toISOString();
    const numberOrNull = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    return {
      id: String(plan.id || createUuid()),
      user_id: session.user.id,
      title: String(plan.title || "").trim().slice(0, 180),
      category: String(plan.category || "Other").slice(0, 60),
      status: String(plan.status || "idea").slice(0, 30),
      target_date: /^\d{4}-\d{2}-\d{2}$/.test(plan.target_date || plan.targetDate || "")
        ? String(plan.target_date || plan.targetDate).slice(0, 10)
        : null,
      place: String(plan.place || "").trim().slice(0, 180),
      estimated_budget: numberOrNull(plan.estimated_budget ?? plan.estimatedBudget),
      notes: String(plan.notes || "").slice(0, 20000),
      checklist: Array.isArray(plan.checklist) ? plan.checklist.slice(0, 80) : [],
      links: Array.isArray(plan.links) ? plan.links.slice(0, 30) : [],
      attachments: Array.isArray(plan.attachments) ? plan.attachments.slice(0, 30) : [],
      favorite: Boolean(plan.favorite),
      priority: String(plan.priority || "medium").slice(0, 20),
      actual_date: /^\d{4}-\d{2}-\d{2}$/.test(plan.actual_date || plan.actualDate || "")
        ? String(plan.actual_date || plan.actualDate).slice(0, 10)
        : null,
      favorite_memory: String(plan.favorite_memory || plan.favoriteMemory || "").slice(0, 12000),
      actual_budget: numberOrNull(plan.actual_budget ?? plan.actualBudget),
      rating: (() => {
        const value = Number(plan.rating);
        return value >= 1 && value <= 5 ? Math.round(value) : null;
      })(),
      created_at: plan.created_at || plan.createdAt || now,
      updated_at: plan.updated_at || plan.updatedAt || now
    };
  }

  async function listOurSpacePlans() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access Our Space.") };
    const { data, error } = await client
      .from("our_space_plans")
      .select(OUR_SPACE_SELECT)
      .eq("user_id", session.user.id)
      .order("target_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    return { data: data || [], error };
  }

  async function saveOurSpacePlan(plan = {}) {
    if (!isReady()) return { data: null, error: new Error("Sign in to sync Our Space.") };
    const row = toOurSpaceRow(plan);
    row.updated_at = new Date().toISOString();
    const { data, error } = await client
      .from("our_space_plans")
      .upsert(row, { onConflict: "id" })
      .select(OUR_SPACE_SELECT)
      .single();
    emit(error ? "error" : "online", error ? "Our Space sync error" : "Synced");
    return { data, error };
  }

  async function deleteOurSpacePlan(planId) {
    if (!isReady()) return { error: new Error("Sign in to sync Our Space.") };
    const { error } = await client
      .from("our_space_plans")
      .delete()
      .eq("id", String(planId))
      .eq("user_id", session.user.id);
    emit(error ? "error" : "online", error ? "Our Space delete error" : "Synced");
    return { error };
  }

  async function replaceOurSpacePlans(plans = []) {
    if (!isReady()) return { error: null };
    const { error: deleteError } = await client
      .from("our_space_plans")
      .delete()
      .eq("user_id", session.user.id);
    if (deleteError) return { error: deleteError };

    const rows = (Array.isArray(plans) ? plans : []).map(toOurSpaceRow);
    if (!rows.length) return { error: null };

    const { error } = await client.from("our_space_plans").insert(rows);
    emit(error ? "error" : "online", error ? "Our Space sync error" : "Synced");
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

    const [documentsResult, foldersResult, versionsResult, templatesResult, journalResult, ourSpaceResult] = await Promise.all([
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
        .order("updated_at", { ascending: false }),
      client
        .from("journal_entries")
        .select(JOURNAL_SELECT)
        .eq("user_id", session.user.id)
        .order("entry_date", { ascending: false }),
      client
        .from("our_space_plans")
        .select(OUR_SPACE_SELECT)
        .eq("user_id", session.user.id)
        .order("target_date", { ascending: true, nullsFirst: false })
    ]);

    const error = documentsResult.error || foldersResult.error || versionsResult.error || templatesResult.error || journalResult.error || ourSpaceResult.error;
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
        journalEntries: journalResult.data || [],
        ourSpacePlans: ourSpaceResult.data || [],
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

    // Do not apply an older account's (or older request's) cloud response.
    // Supabase queries continue independently, but stale responses are ignored.
    const requestedUserId = session.user.id;
    const requestSequence = ++cloudHydrationSequence;
    emit("syncing", "Loading");

    const [tasksResult, eventsResult, financeResult, noteResult, templatesResult, journalResult, ourSpaceResult] =
      await Promise.all([
        fetchCollection("tasks"),
        fetchCollection("events"),
        fetchCollection("finance_entries"),
        client.from("notes").select("content").eq("user_id", session.user.id).maybeSingle(),
        client
          .from("custom_templates")
          .select(TEMPLATE_SELECT)
          .eq("user_id", session.user.id)
          .order("updated_at", { ascending: false }),
        client
          .from("journal_entries")
          .select(JOURNAL_SELECT)
          .eq("user_id", session.user.id)
          .order("entry_date", { ascending: false }),
        client
          .from("our_space_plans")
          .select(OUR_SPACE_SELECT)
          .eq("user_id", session.user.id)
          .order("target_date", { ascending: true, nullsFirst: false })
      ]);

    if (!isReady() || session.user.id !== requestedUserId ||
        requestSequence !== cloudHydrationSequence) {
      return { error: null, stale: true };
    }

    const firstError =
      tasksResult.error ||
      eventsResult.error ||
      financeResult.error ||
      noteResult.error ||
      templatesResult.error ||
      journalResult.error ||
      ourSpaceResult.error;

    if (firstError) {
      await syncWorkspace();
      emit("error", "Cloud error");
      return { error: firstError };
    }

    const cloudHasData =
      tasksResult.data.length ||
      eventsResult.data.length ||
      financeResult.data.length ||
      typeof noteResult.data?.content === "string" ||
      templatesResult.data?.length ||
      journalResult.data?.length ||
      ourSpaceResult.data?.length;

    if (cloudHasData && typeof window.BoxOSCloudHydrate === "function") {
      window.BoxOSCloudHydrate({
        events: eventsResult.data,
        finance_entries: financeResult.data,
        custom_templates: templatesResult.data || [],
        journal_entries: journalResult.data || [],
        our_space_plans: ourSpaceResult.data || []
      });
    } else {
      const seed = await syncWorkspace(true);
      if (seed.error) return seed;
      await syncNow();
    }

    return syncWorkspace();
  }


  async function syncNow() {
    if (!isReady()) return { error: new Error("Sign in first.") };

    syncing = true;
    emit("syncing", "Syncing");

    try {

      const localEvents = JSON.parse(localStorage.getItem("theBoxOS4Events") || "[]");
      const localFinance = JSON.parse(localStorage.getItem("theBoxOS4Finance") || "[]");
      const localTemplates = JSON.parse(localStorage.getItem("theBoxOSCustomTemplates") || "[]");
      const localJournal = JSON.parse(localStorage.getItem("theBoxOSJournalEntries") || "[]");
      const localOurSpace = JSON.parse(localStorage.getItem("theBoxOSOurSpacePlans") || "[]");

      const results = await Promise.all([
        syncWorkspace(),
        replaceCollection("events", localEvents),
        replaceCollection("finance_entries", localFinance),
        replaceCustomTemplates(localTemplates),
        replaceJournalEntries(localJournal),
        replaceOurSpacePlans(localOurSpace)
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

    client.auth.onAuthStateChange((_event, nextSession) => {
      const changed = session?.user?.id !== nextSession?.user?.id;
      session = nextSession;
      if (changed) lastTaskSnapshot = "";
      setTimeout(() => {
        if (session !== nextSession) return;
        emit(session ? "online" : "offline", session ? "Connected" : "Sign in");
        if (changed && session) void hydrateFromCloud();
      }, 0);
    });

    if (session) {
      await hydrateFromCloud();
    }

    return { session };
  }

  window.addEventListener("online", queueWorkspaceSync);
  window.addEventListener("focus", queueWorkspaceSync);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) queueWorkspaceSync();
  });
  setInterval(() => {
    if (isReady() && !document.hidden) queueWorkspaceSync();
  }, 20000);


  function frameFolder(owner) {
    if (!owner || owner !== session?.user?.id) throw new Error("Sign in to sync photos.");
    return owner + "/memory-frame";
  }

  const frameBucket = () => client.storage.from(DOCUMENT_BUCKET);
  const frameKey = photo => {
    if (!/^[a-zA-Z0-9-]+$/.test(photo.id)) throw new Error("Invalid photo ID");
    const encoder = new TextEncoder();
    let displayName = Array.from(photo.name);
    while (encoder.encode(displayName.join("")).length > 440) displayName.pop();
    const bytes = encoder.encode(displayName.join(""));
    return photo.id + "_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  };
  async function listFramePhotos(owner) {
    const folder = frameFolder(owner);
    const photos = [];
    for (let offset = 0; ; offset += 100) {
      const {data, error} = await frameBucket().list(folder, {limit:100, offset, sortBy:{column:"name",order:"asc"}});
      if (error) throw error;
      for (const entry of data) {
        const match = /^([a-zA-Z0-9-]+)_((?:[a-f0-9]{2})+)$/.exec(entry.name);
        if (!match) continue;
        const name = new TextDecoder().decode(Uint8Array.from(match[2].match(/../g), x => parseInt(x,16)));
        photos.push({id:match[1], name, size:entry.metadata?.size, type:entry.metadata?.mimetype, createdAt:entry.created_at});
      }
      if (data.length < 100) return photos.sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    }
  }
  async function uploadFramePhoto(owner, photo, blob) {
    const path = frameFolder(owner) + "/" + frameKey(photo);
    const {error} = await frameBucket().upload(path, blob, {contentType:photo.type, upsert:false});
    if (error && !/duplicate|already exists/i.test(error.message)) throw error;
  }
  async function downloadFramePhoto(owner, photo) {
    const {data,error} = await frameBucket().download(frameFolder(owner) + "/" + frameKey(photo));
    if (error) throw error;
    return data;
  }
  async function removeFramePhotos(owner, photos) {
    const folder = frameFolder(owner);
    const {error} = await frameBucket().remove(photos.map(p => folder + "/" + frameKey(p)));
    if (error) throw error;
  }

  const dropBucket = () => client.storage.from("box-file-drop");

  async function uploadDrop(file, thumbnail = null) {
    if (!isReady()) throw new Error("Sign in to use File Drop.");
    if (file.size > MAX_DOCUMENT_SIZE) throw new Error("Maximum file size is 25 MB.");
    const path = session.user.id + "/" + createUuid();
    const result = await dropBucket().upload(path, file, {
      cacheControl: "0",
      contentType: file.type || "application/octet-stream",
      metadata: { original_name: file.name, thumbnail }
    });
    if (result.error) throw result.error;
  }

  async function listDrops() {
    if (!isReady()) return [];
    const {data, error} = await client.rpc("box_drop_previews");
    if (error) throw error;
    return data || [];
  }

  async function downloadDrop(path) {
    if (!isReady() || !path.startsWith(session.user.id + "/")) throw new Error("Sign in to download.");
    const {data, error} = await dropBucket().download(path);
    if (error) throw error;
    return data;
  }

  return {
    uploadDrop, listDrops, downloadDrop,
    listFramePhotos, uploadFramePhoto, downloadFramePhoto, removeFramePhotos,
    start,
    isConfigured,
    isReady,
    signIn,
    signUp,
    signOut,
    syncNow,
    refreshTasksAndNotes: () => syncWorkspace(),
    queueCollectionSync,
    recordTaskChanges,
    queueNoteSync: queueWorkspaceSync,
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
    replaceCustomTemplates,
    listJournalEntries,
    saveJournalEntry,
    deleteJournalEntry,
    replaceJournalEntries,
    listOurSpacePlans,
    saveOurSpacePlan,
    deleteOurSpacePlan,
    replaceOurSpacePlans
  };
})();