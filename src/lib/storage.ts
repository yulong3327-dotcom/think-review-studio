import type { ReviewDocument, ThinkData } from '../types';

const DB_NAME = 'think-review-studio';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadWorkspace(): Promise<ReviewDocument[] | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('workspace').objectStore('workspace').get('documents');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function saveWorkspace(documents: ReviewDocument[]): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('workspace', 'readwrite');
      transaction.objectStore('workspace').put(documents, 'documents');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export function makeDocument(data: ThinkData, name: string, source: string, demo = false): ReviewDocument {
  return { id: crypto.randomUUID(), name, source, data: structuredClone(data), original: structuredClone(data), status: 'pending', note: '', importedAt: new Date().toISOString(), demo };
}
export function isModified(document: ReviewDocument): boolean {
  return JSON.stringify(document.data) !== JSON.stringify(document.original);
}
