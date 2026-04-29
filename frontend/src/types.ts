export interface WaveformData {
  points: number[]
}

export interface SpectrogramData {
  data: number[][]
  shape: [number, number]
  hf_rolloff_hz: number
}

export interface LoudnessData {
  dr14: number
  lufs: number
  true_peak_dbtp: number
  crest_factor: number
}

export interface FrequencyData {
  freqs_hz: number[]
  psd_db: number[]
}

export interface StereoData {
  is_mono: boolean
  correlation: number
  stereo_width: number
  mid_rms?: number[]
  side_rms?: number[]
}

export interface Section {
  start_sec: number
  end_sec: number
  label: 'quiet' | 'loud' | 'peak'
  rms: number
}

export interface FileResult {
  audio_file_id: number
  waveform: number[]
  spectrogram: SpectrogramData
  loudness: LoudnessData
  frequency: FrequencyData
  rms_curve: number[]
  stereo: StereoData
  sections: Section[]
}

export interface ResultsResponse {
  source: 'cache' | 'db'
  results: FileResult[]
}
