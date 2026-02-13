import { generateId } from '../utils/crypto.ts';

export async function uploadMedia(
  bucket: R2Bucket,
  data: ArrayBuffer | ReadableStream,
  filename: string,
  contentType: string
): Promise<string> {
  const id = generateId();
  const key = `${id}/${filename}`;
  await bucket.put(key, data, {
    httpMetadata: { contentType },
    customMetadata: { originalFilename: filename },
  });
  return id;
}

export async function getMedia(bucket: R2Bucket, id: string): Promise<R2ObjectBody | null> {
  // List objects with the id prefix to find the file
  const listed = await bucket.list({ prefix: `${id}/`, limit: 1 });
  if (listed.objects.length === 0) return null;

  const key = listed.objects[0]!.key;
  return bucket.get(key);
}
