// Identify optional editor/conversion assets using Rollup's actual dependency graph.
// Shared code and other existing lazy features (e.g. grading screenshots) stay precached.
export function collectDeferredAssets(bundle) {
  const chunks = Object.values(bundle).filter(item => item.type === 'chunk')
  const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]))
  const isOptionalModule = id => /\/(?:components\/admin\/PDFEditorPanel\.tsx|services\/pdfConverter\.ts|node_modules\/heic2any\/)/.test(id.replaceAll('\\', '/'))
  const roots = chunks.filter(chunk => chunk.moduleIds.some(isOptionalModule)).map(chunk => chunk.fileName)
  function closure(files, includeDynamic = false, stopAt = new Set()) {
    const result = new Set()
    function visit(name) {
      if (result.has(name)) return
      result.add(name)
      if (stopAt.has(name)) return
      const chunk = byName.get(name)
      if (!chunk) return
      for (const dependency of chunk.imports) visit(dependency)
      if (includeDynamic) for (const dependency of chunk.dynamicImports) visit(dependency)
      for (const css of chunk.viteMetadata?.importedCss ?? []) result.add(css)
      for (const asset of chunk.viteMetadata?.importedAssets ?? []) result.add(asset)
    }
    files.forEach(visit)
    return result
  }
  const initial = closure(chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.fileName))
  const optional = closure(roots, true, initial)
  const otherLazyRoots = chunks.filter(chunk => initial.has(chunk.fileName) || !optional.has(chunk.fileName))
    .flatMap(chunk => chunk.dynamicImports).filter(name => !roots.includes(name))
  const preserved = new Set([...initial, ...closure(otherLazyRoots, true)])
  return {
    roots,
    initial: [...initial].sort(),
    deferred: [...optional].filter(name => !preserved.has(name)).sort(),
  }
}

export function createDeferredAssets() {
  let excluded = new Set()
  return {
    plugin: {
      name: 'deferred-editor-assets',
      enforce: 'post',
      generateBundle(_, bundle) {
        const report = collectDeferredAssets(bundle)
        excluded = new Set(report.deferred)
        this.emitFile({ type: 'asset', fileName: 'deferred-assets.json', source: JSON.stringify(report, null, 2) })
      },
    },
    manifestTransform: async entries => ({
      manifest: entries.filter(entry => !excluded.has(entry.url)),
      warnings: [],
    }),
  }
}
