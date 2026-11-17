import { LatLngPoint, SpatialPointItem } from '../core/GeoTypes';
import { queryPointsInPolygon } from '../spatial/SpatialQuery';
import { PolygonEditor, PolygonEditorSnapshot } from './PolygonEditor';

export type DrawingToolMode = 'none' | 'polygon' | 'rectangle';

export class DrawingController {
  private mode: DrawingToolMode = 'none';
  private editor = new PolygonEditor();

  getMode(): DrawingToolMode {
    return this.mode;
  }

  startDrawing(mode: Exclude<DrawingToolMode, 'none'>): PolygonEditorSnapshot {
    this.mode = mode;
    return this.editor.clearAll();
  }

  cancelDrawing(): PolygonEditorSnapshot {
    this.mode = 'none';
    return this.editor.clearAll();
  }

  addPoint(point: LatLngPoint): PolygonEditorSnapshot {
    if (this.mode === 'none') {
      this.mode = 'polygon';
    }
    return this.editor.addVertex(point);
  }

  drawRectangle(cornerA: LatLngPoint, cornerB: LatLngPoint): PolygonEditorSnapshot {
    this.mode = 'rectangle';
    return this.editor.setRectangle(cornerA, cornerB);
  }

  undo(): PolygonEditorSnapshot {
    return this.editor.undoLastVertex();
  }

  getSnapshot(): PolygonEditorSnapshot {
    return this.editor.getSnapshot();
  }

  filterItemsInsideDrawing<T>(items: readonly SpatialPointItem<T>[]): SpatialPointItem<T>[] {
    const snap = this.editor.getSnapshot();
    if (!snap.validation.valid) return [];
    return queryPointsInPolygon(items, snap.vertices);
  }
}
