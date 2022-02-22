import { Message } from "./types"
import { DocumentDependencyGraph } from "./depsGraph"
import { stringify } from "./jsonpath"

export interface IFormatter<T> {
  format: (msg: Message | Message[]) => T[]
}

export class JsonFormatter implements IFormatter<string> {
  constructor(private graph: DocumentDependencyGraph) {}
  format(message: Message | Message[]) {
    const outputs = []
    const msgs = Array.isArray(message) ? message : [message]
    for (const msg of msgs) {
      const document = this.graph.getDocument(msg.Source[0].document)
      let path = (msg.Source[0].Position as any).path
      if (path[0] === "$") {
        path = path.slice(1)
      }
      const pos = document.getPositionFromJsonPath(path)

      const jsonMsg = {
        ...msg.Details,
        sources: [msg.Source[0].document + `:${pos.start.line}:${pos.start.column}`],
        "json-path": stringify(path),
        location: pos
      }
      outputs.push(jsonMsg)
    }
    return outputs
  }
}