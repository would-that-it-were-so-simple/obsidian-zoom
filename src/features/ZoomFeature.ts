import { Notice, Plugin } from "obsidian";

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { Feature } from "./Feature";
import { getDocumentTitle } from "./utils/getDocumentTitle";
import { isFoldingEnabled } from "./utils/isFoldingEnabled";

import { CalculateRangeForZooming } from "../logic/CalculateRangeForZooming";
import { CollectBreadcrumbs } from "../logic/CollectBreadcrumbs";
import { KeepOnlyZoomedContentVisible } from "../logic/KeepOnlyZoomedContentVisible";
import {
  RemoveSharedIndentation,
  SharedIndentationState,
} from "../logic/RemoveSharedIndentation";
import { LoggerService } from "../services/LoggerService";
import { getEditorViewFromEditor } from "../utils/getEditorViewFromEditor";

export type ZoomInCallback = (view: EditorView, pos: number) => void;
export type ZoomOutCallback = (view: EditorView) => void;

export class ZoomFeature implements Feature {
  private zoomInCallbacks: ZoomInCallback[] = [];
  private zoomOutCallbacks: ZoomOutCallback[] = [];

  private keepOnlyZoomedContentVisible = new KeepOnlyZoomedContentVisible(
    this.logger
  );
  private removeSharedIndentation = new RemoveSharedIndentation();
  private calculateRangeForZooming = new CalculateRangeForZooming();
  private collectBreadcrumbs = new CollectBreadcrumbs({
    getDocumentTitle: getDocumentTitle,
  });

  constructor(private plugin: Plugin, private logger: LoggerService) {}

  public calculateVisibleContentRange(state: EditorState) {
    return this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(
      state
    );
  }

  public calculateHiddenContentRanges(state: EditorState) {
    return this.keepOnlyZoomedContentVisible.calculateHiddenContentRanges(
      state
    );
  }

  public calculateSharedIndentationState(
    state: EditorState
  ): SharedIndentationState {
    return this.removeSharedIndentation.getSharedIndentationState(state);
  }

  public notifyAfterZoomIn(cb: ZoomInCallback) {
    this.zoomInCallbacks.push(cb);
  }

  public notifyAfterZoomOut(cb: ZoomOutCallback) {
    this.zoomOutCallbacks.push(cb);
  }

  public refreshZoom(view: EditorView) {
    const prevRange =
      this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(
        view.state
      );

    if (!prevRange) {
      return;
    }

    const newRange = this.calculateRangeForZooming.calculateRangeForZooming(
      view.state,
      prevRange.from
    );

    if (!newRange) {
      return;
    }

    this.keepOnlyZoomedContentVisible.keepOnlyZoomedContentVisible(
      view,
      newRange.from,
      newRange.to,
      { scrollIntoView: false }
    );
  }

  public zoomIn(view: EditorView, pos: number) {
    const l = this.logger.bind("ZoomFeature:zoomIn");
    l("zooming in");

    if (!isFoldingEnabled(this.plugin.app)) {
      new Notice(
        `In order to zoom, you must first enable "Fold heading" and "Fold indent" under Settings -> Editor`
      );
      return;
    }

    const range = this.calculateRangeForZooming.calculateRangeForZooming(
      view.state,
      pos
    );

    if (!range) {
      l("unable to calculate range for zooming");
      return;
    }

    this.keepOnlyZoomedContentVisible.keepOnlyZoomedContentVisible(
      view,
      range.from,
      range.to
    );

    for (const cb of this.zoomInCallbacks) {
      cb(view, pos);
    }
  }

  public zoomOut(view: EditorView) {
    const l = this.logger.bind("ZoomFeature:zoomOut");
    l("zooming out");

    this.keepOnlyZoomedContentVisible.showAllContent(view);

    for (const cb of this.zoomOutCallbacks) {
      cb(view);
    }
  }

  public zoomOutOneLevel(view: EditorView) {
    const l = this.logger.bind("ZoomFeature:zoomOutOneLevel");
    l("zooming out one level");

    const currentRange =
      this.keepOnlyZoomedContentVisible.calculateVisibleContentRange(
        view.state
      );

    if (!currentRange) {
      this.zoomOut(view);
      return;
    }

    const breadcrumbs = this.collectBreadcrumbs.collectBreadcrumbs(
      view.state,
      currentRange.from
    );

    // breadcrumbs: [document root (pos: null), ...ancestors, current]
    // Second-to-last is the parent; if parent is root, zoom out completely
    if (breadcrumbs.length <= 2) {
      this.zoomOut(view);
      return;
    }

    const parent = breadcrumbs[breadcrumbs.length - 2];

    if (parent.pos === null) {
      this.zoomOut(view);
      return;
    }

    l("zooming to parent at pos", parent.pos);
    this.zoomIn(view, parent.pos);
  }

  async load() {
    this.plugin.registerEditorExtension(
      this.keepOnlyZoomedContentVisible.getExtension()
    );
    this.plugin.registerEditorExtension(
      this.removeSharedIndentation.getExtension()
    );

    this.plugin.addCommand({
      id: "zoom-in",
      name: "Zoom in",
      icon: "zoom-in",
      editorCallback: (editor) => {
        const view = getEditorViewFromEditor(editor);
        this.zoomIn(view, view.state.selection.main.head);
      },
      hotkeys: [
        {
          modifiers: ["Mod"],
          key: ".",
        },
      ],
    });

    this.plugin.addCommand({
      id: "zoom-out",
      name: "Zoom out the entire document",
      icon: "zoom-out",
      editorCallback: (editor) => this.zoomOut(getEditorViewFromEditor(editor)),
      hotkeys: [
        {
          modifiers: ["Mod", "Shift"],
          key: ".",
        },
      ],
    });

    this.plugin.addCommand({
      id: "zoom-out-one-level",
      name: "Zoom out one level",
      icon: "zoom-out",
      editorCallback: (editor) =>
        this.zoomOutOneLevel(getEditorViewFromEditor(editor)),
      hotkeys: [
        {
          modifiers: ["Mod", "Alt"],
          key: ".",
        },
      ],
    });
  }

  async unload() {}
}
