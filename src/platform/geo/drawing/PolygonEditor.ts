import { LatLngPoint } from '../core/GeoTypes';
import { calculatePolygonAreaSqMeters, calculatePolygonPerimeterMeters } from '../spatial/GeometryOperations';
import { PolygonValidationReport, validateDrawnPolygon } from './GeometryValidator';

export const MAX_POLYGON_UNDO_HISTORY = 25; // >= 20 steps required by Stage 4

export interface PolygonEditorSnapshot {
  vertices: LatLngPoint[];
  areaSqMeters: number;
  perimeterMeters: number;
  validation: PolygonValidationReport;
  canUndo: boolean;
  undoDepth: number;
}

export class PolygonEditor {
  private vertices: LatLngPoint[] = [];
  private history: LatLngPoint[][] = [];
  private maxUndoSteps: number;

  constructor(maxUndoSteps = MAX_POLYGON_UNDO_HISTORY) {
    this.maxUndoSteps = Math.max(20, maxUndoSteps);
  }

  addVertex(point: LatLngPoint): PolygonEditorSnapshot {
    this.pushHistory();
    this.vertices = [...this.vertices, { lat: point.lat, lng: point.lng }];
    return this.getSnapshot();
  }

  updateVertex(index: number, point: LatLngPoint): PolygonEditorSnapshot {
    if (index < 0 || index >= this.vertices.length) return this.getSnapshot();
    this.pushHistory();
    this.vertices = this.vertices.map((v, idx) =>
      idx === index ? { lat: point.lat, lng: point.lng } : v
    );
    return this.getSnapshot();
  }

  removeVertex(index: number): PolygonEditorSnapshot {
    if (index < 0 || index >= this.vertices.length) return this.getSnapshot();
    this.pushHistory();
    this.vertices = this.vertices.filter((_, idx) => idx !== index);
    return this.getSnapshot();
  }

  setRectangle(cornerA: LatLngPoint, cornerB: LatLngPoint): PolygonEditorSnapshot {
    this.pushHistory();
    const north = Math.max(cornerA.lat, cornerB.lat);
    const south = Math.min(cornerA.lat, cornerB.lat);
    const east = Math.max(cornerA.lng, cornerB.lng);
    const west = Math.min(cornerA.lng, cornerB.lng);

    this.vertices = [
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
      { lat: south, lng: west },
    ];
    return this.getSnapshot();
  }

  undoLastVertex(): PolygonEditorSnapshot {
    const previous = this.history.pop();
    if (previous) {
      this.vertices = previous;
    } else if (this.vertices.length > 0) {
      this.vertices = this.vertices.slice(0, -1);
    }
    return this.getSnapshot();
  }

  clearAll(): PolygonEditorSnapshot {
    if (this.vertices.length > 0) {
      this.pushHistory();
    }
    this.vertices = [];
    return this.getSnapshot();
  }

  getSnapshot(): PolygonEditorSnapshot {
    const validation = validateDrawnPolygon(this.vertices);
    return {
      vertices: [...this.vertices],
      areaSqMeters: validation.valid ? validation.areaSqMeters : calculatePolygonAreaSqMeters(this.vertices),
      perimeterMeters: this.vertices.length >= 2 ? calculatePolygonPerimeterMeters(this.vertices) : 0,
      validation,
      canUndo: this.history.length > 0 || this.vertices.length > 0,
      undoDepth: this.history.length,
    };
  }

  private pushHistory(): void {
    this.history.push(this.vertices.map((v) => ({ ...v })));
    if (this.history.length > this.maxUndoSteps) {
      this.history.shift();
    }
  }
}
