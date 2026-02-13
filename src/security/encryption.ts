const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12;
const KEY_LENGTH = 256;

async function deriveKey(keyHex: string): Promise<CryptoKey> {
  const keyBytes = new Uint8Array(keyHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM, length: KEY_LENGTH }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encrypt(plaintext: string, keyHex: string): Promise<Uint8Array> {
  const key = await deriveKey(keyHex);
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);

  // Prepend IV to ciphertext
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_LENGTH);
  return result;
}

export async function decrypt(data: Uint8Array, keyHex: string): Promise<string> {
  const key = await deriveKey(keyHex);
  const iv = data.slice(0, IV_LENGTH);
  const ciphertext = data.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
