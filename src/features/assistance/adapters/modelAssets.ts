import { modelAssetUrls, type ModelKind, type ModelFiles } from '../domain/modelFiles'
export {
  CAPTION_MODEL,
  modelAssetUrls,
  type ModelKind,
  type ModelFiles,
} from '../domain/modelFiles'
export async function inspectModelFiles(kind: ModelKind): Promise<ModelFiles> {
  if (!('caches' in globalThis)) return 'unknown'
  try {
    const files = await Promise.all(modelAssetUrls(kind).map((url) => caches.match(url)))
    const count = files.filter((response) => response?.ok).length
    return count === files.length ? 'available' : count ? 'partial' : 'absent'
  } catch {
    return 'unknown'
  }
}
export async function removeModelFiles(kind: ModelKind): Promise<void> {
  if (!('caches' in globalThis)) throw new Error('Browser model storage is unavailable.')
  const urls = modelAssetUrls(kind)
  for (const name of await caches.keys()) {
    const cache = await caches.open(name)
    await Promise.all(urls.map((url) => cache.delete(url)))
  }
}
