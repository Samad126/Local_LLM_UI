export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'pptx'
export const DOC_KINDS: DocKind[] = ['pdf', 'docx', 'xlsx', 'pptx']
export const isDocKind = (l?: string): l is DocKind => !!l && (DOC_KINDS as string[]).includes(l)
