/**
 * The one Plotly `config` every chart is drawn with — in the app, in the static
 * export charts, and in the export's live situation runtime.
 */

import type { Config } from 'plotly.js'

export const PLOT_CONFIG: Readonly<Partial<Config>> = Object.freeze({
  responsive: true,
  // Plotly 4 turned the "Upload to Cloud" modebar button on by default. It posts the
  // chart's data to cloud.plotly.com, and this app's whole promise is that hand
  // histories never leave the browser — so it stays off everywhere.
  showSendToCloud: false,
})
