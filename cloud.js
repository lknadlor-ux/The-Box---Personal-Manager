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

  async function listDocuments() {
    if (!isReady()) return { data: [], error: new Error("Sign in to access documents.") };

    const { data, error } = await client
      .from("documents")
      .select("id,name,storage_path,folder,details,mime_type,size_bytes,is_favorite,deleted_at,created_at,updated_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    return { data: data || [], error };
  }

  async function uploadDocument(file, folder, details = "") {
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
        mime_type: file.type || null,
        size_bytes: file.size,
        is_favorite: false,
        updated_at: new Date().toISOString()
      })
      .select("id,name,storage_path,folder,details,mime_type,size_bytes,is_favorite,deleted_at,created_at,updated_at")
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

  async function updateDocumentDetails(documentId, details) {
    if (!isReady()) return { data: null, error: new Error("Sign in first.") };

    const cleanDetails = String(details || "").trim().slice(0, 2000);

    const { data, error } = await client
      .from("documents")
      .update({
        details: cleanDetails || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId)
      .eq("user_id", session.user.id)
      .select("id,details,updated_at")
      .single();

    emit(error ? "error" : "online", error ? "Sync error" : "Synced");
    return { data, error };
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

    const { error: storageError } = await client.storage
      .from(DOCUMENT_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      emit("error", "Delete error");
      return { error: storageError };
    }

    const { error: metadataError } = await client
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("user_id", session.user.id);

    emit(metadataError ? "error" : "online", metadataError ? "Delete error" : "Synced");
    return { error: metadataError };
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

    const [tasksResult, eventsResult, financeResult, noteResult] =
      await Promise.all([
        fetchCollection("tasks"),
        fetchCollection("events"),
        fetchCollection("finance_entries"),
        client.from("notes").select("content").eq("user_id", session.user.id).maybeSingle()
      ]);

    const firstError =
      tasksResult.error ||
      eventsResult.error ||
      financeResult.error ||
      noteResult.error;

    if (firstError) {
      emit("error", "Cloud error");
      return { error: firstError };
    }

    const cloudHasData =
      tasksResult.data.length ||
      eventsResult.data.length ||
      financeResult.data.length ||
      typeof noteResult.data?.content === "string";

    if (cloudHasData && typeof window.BoxOSCloudHydrate === "function") {
      window.BoxOSCloudHydrate({
        tasks: tasksResult.data,
        events: eventsResult.data,
        finance_entries: financeResult.data,
        notes: noteResult.data?.content
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

      const results = await Promise.all([
        replaceCollection("tasks", localTasks),
        replaceCollection("events", localEvents),
        replaceCollection("finance_entries", localFinance),
        saveNote(localNotes)
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
    updateDocumentDetails,
    setDocumentFavorite,
    createDocumentUrl,
    downloadDocument,
    moveDocumentToTrash,
    restoreDocument,
    permanentlyDeleteDocument
  };
})();