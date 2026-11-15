/** Which full-screen layer a debug caller is looking at (pure; main.ts reads the real DOM and passes booleans). */
export interface LayerFlags {
  mode: string;
  titleHidden: boolean;
  loadingHidden: boolean;
  introHidden: boolean;
}

export interface DebugLayers {
  title: boolean;
  loading: boolean;
  intro: boolean;
  showcase: boolean;
  topLayer: string;
}

export function readLayers(f: LayerFlags): DebugLayers {
  const loading = !f.loadingHidden;
  const intro = !f.introHidden;
  const title = !f.titleHidden;
  const showcase = f.mode === 'showcase';
  const topLayer = loading ? 'loading' : intro ? 'intro' : title ? 'title' : showcase ? 'showcase' : f.mode;
  return { title, loading, intro, showcase, topLayer };
}
