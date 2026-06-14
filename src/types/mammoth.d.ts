declare module 'mammoth' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: any[] }>;
}
