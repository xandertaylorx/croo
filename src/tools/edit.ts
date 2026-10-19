/** Exact string replacement. Throws a model-friendly error when the edit is ambiguous or impossible. */
export function applyEdit(content: string, oldStr: string, newStr: string, replaceAll = false): string {
  if (oldStr === '') throw new Error('old_string must not be empty (use write_file to create files).')
  if (oldStr === newStr) throw new Error('old_string and new_string are identical.')
  const first = content.indexOf(oldStr)
  if (first === -1) throw new Error('old_string was not found in the file. It must match exactly, including whitespace.')
  if (replaceAll) return content.split(oldStr).join(newStr)
  if (content.indexOf(oldStr, first + oldStr.length) !== -1) {
    throw new Error('old_string matches more than once. Add surrounding context to make it unique, or set replace_all.')
  }
  return content.slice(0, first) + newStr + content.slice(first + oldStr.length)
}
