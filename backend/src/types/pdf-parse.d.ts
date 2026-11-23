declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdfParse: (data: Buffer, options?: { pagerender?: (pageData: any) => Promise<string> | string; max?: number }) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}
