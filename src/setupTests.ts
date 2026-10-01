// jsdom has no canvas: getContext() logs "not implemented" and returns null. The board already
// handles a missing context (it just doesn't draw), so return null quietly. Drawing is covered by
// the Playwright suite in e2e/.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}
