import { DocumentDependencyGraph } from "./depsGraph"
import $RefParser, { FileInfo } from "@apidevtools/json-schema-ref-parser"
import _ from "lodash"
import { followReference, isExample, traverse } from "./utils"

export class SwaggerUtils {
  private schemaCaches = new Map<string, any>()
  constructor(private innerDoc?: any, private specPath?: string, private graph?: DocumentDependencyGraph) {}

  public getOperationIdFromPath(path: string, code = "get") {
    let pathObj = this.innerDoc.paths[path]
    if (!pathObj && this.innerDoc["x-ms-paths"]) {
      pathObj = this.innerDoc["x-ms-paths"][path]
    }
    if (pathObj && pathObj[code]) {
      return pathObj[code].operationId
    }
  }

  public getDefinitionByName(modelName: string) {
    if (!modelName) {
      return undefined
    }
    return this.innerDoc?.definitions[modelName]
  }

  /**
   * get property of model recursively, if not found return undefined
   */
  public getPropertyOfModelName(modelName: string, propertyName: string) {
    const model = this.getDefinitionByName(modelName)
    if (!model) {
      return undefined
    }
    return this.getPropertyOfModel(model, propertyName)
  }

  public getPropertyOfModel(sourceModel: any, propertyName: string) {
    if (!sourceModel) {
      return undefined
    }
    let model = sourceModel
    if (sourceModel.$ref) {
      model = this.getUnwrappedModel(sourceModel)
    }
    if (!model) {
      return undefined
    }
    if (model.properties && model.properties[propertyName]) {
      return this.getUnwrappedModel(model.properties[propertyName])
    }
    if (model.allOf) {
      for (const element of model.allOf) {
        const property = this.getPropertyOfModel(element, propertyName)
        if (property) {
          return property
        }
      }
    }
  }

  private getUnwrappedModel(property: any) {
    if (property) {
      return followReference(this.innerDoc, property, this.graph)
    }
  }

  private resolveExternalRef = async (ref: string) => {
    if (ref && this.schemaCaches.has(ref)) {
      return this.schemaCaches.get(ref)
    }
    const graph = this.graph
    const resolveOption: $RefParser.Options = {
      resolve: {
        file: {
          canRead: true,
          read(file: FileInfo) {
            if (isExample(file.url)) {
              return ""
            }
            return graph.getDocument(file.url).getObj()
          }
        }
      }
    }
    const resolvedSchema = await $RefParser.dereference({ $ref: ref }, resolveOption)
    this.schemaCaches.set(ref, resolvedSchema)
    return resolvedSchema
  }

  static isExternalRef(schema: any) {
    return schema.$ref && !schema.$ref.startsWith("#/")
  }

  public getResolvedRef(ref: string) {
    return this.schemaCaches.get(ref)
  }

  public async resolveSchema(schema: any | string) {
    if (!schema) {
      return schema
    }

    if (SwaggerUtils.isExternalRef(schema)) {
      return await this.resolveExternalRef(schema.$ref)
    }

    if (typeof schema === "string") {
      schema = {
        $ref: schema
      }
    } else {
      schema = _.cloneDeep(schema)
    }

    const replace = (to: any, from: any) => {
      if (!to || !from) {
        return
      }
      delete to.$ref
      Object.entries(from).forEach(v => {
        to[v[0]] = v[1]
      })
    }

    const collectRefs = (schema: any) => {
      const refs = new Set<string>()
      traverse(schema, ["/"], new Set<string>(), {}, (current, path, ctx) => {
        if (SwaggerUtils.isExternalRef(current)) {
          refs.add(current.$ref)
          return false
        }
        return true
      })
      return Array.from(refs.values())
    }

    const promises = []
    for (const ref of collectRefs(schema)) {
      promises.push(this.resolveExternalRef(ref))
    }
    await Promise.all(promises)

    traverse(schema, ["/"], new Set<string>(), this, (current, path, ctx) => {
      if (SwaggerUtils.isExternalRef(current)) {
        const resolved = ctx.getResolvedRef(current.$ref)
        replace(current, resolved)
        return false
      }
      return true
    })
    return schema
  }
}
