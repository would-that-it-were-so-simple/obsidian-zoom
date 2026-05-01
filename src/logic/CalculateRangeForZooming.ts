import { foldable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

export class CalculateRangeForZooming {
  public calculateRangeForZooming(state: EditorState, pos: number) {
    let line = state.doc.lineAt(pos);
    for (;;) {
      const foldRange = foldable(state, line.from, line.to);
      if (foldRange) return { from: line.from, to: foldRange.to };
      // Headings and bullets with no foldable content can still be zoomed into
      if (
        /^\s*#{1,6}\s/.test(line.text) ||
        /^\s*([-*+]|\d+\.)\s+/.test(line.text)
      ) {
        return { from: line.from, to: line.to };
      }
      // Walk up to find the containing section
      if (!line.from) return null;
      line = state.doc.lineAt(line.from - 1);
    }
  }
}
