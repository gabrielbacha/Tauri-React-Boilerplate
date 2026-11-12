export const isComposingInput = (event: { isComposing: boolean; keyCode?: number }): boolean =>
  event.isComposing || event.keyCode === 229;
