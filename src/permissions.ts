/** Read-only tools run freely; anything that writes or executes needs approval. */
export const READ_ONLY_TOOLS = new Set(['read_file', 'list_files', 'grep'])

export class Permissions {
  private always = new Set<string>()

  constructor(public yolo = false) {}

  needsApproval(tool: string): boolean {
    if (this.yolo) return false
    if (READ_ONLY_TOOLS.has(tool)) return false
    return !this.always.has(tool)
  }

  allowAlways(tool: string) {
    this.always.add(tool)
  }
}
