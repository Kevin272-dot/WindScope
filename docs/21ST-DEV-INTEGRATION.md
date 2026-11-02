# 21st.dev integration notes

## Design direction

The selected template is [Lytic by TailGrids](https://21st.dev/community/templates/tailgrids-lytic), a React analytics dashboard organized around key metrics and charts. The 21st.dev MCP lists this as a template but does not return template source or an install command, so no template code was imported.

WindScope now leads with the January day-ahead wind decision report: the selected pre-cutoff WINDFOR forecast, FUELHH WIND actuals, and measured forecast error. The GB national demand outlook remains a separate section with its own Elexon NDF source and units. Missing values remain visible and are never filled with estimates.

## Components and implementation status

| 21st.dev item | Intended role | Status |
| --- | --- | --- |
| [Progress Metric Card](https://21st.dev/@makviesainte/components/progress-metric-card) | Lead energy KPI with recent history | Source inspected through MCP and adapted in `KpiCard.tsx`: the MWh total stays primary, with a compact 10/20-day history trend. Only complete Elexon daily totals are plotted; missing days remain gaps. Trend deltas and averages from the registry demo were omitted. |
| [Chart Line](https://21st.dev/@mirukullacode/components/chart-line) | Half-hour demand profile interactions | Catalog pattern adapted in `DemandChart.tsx`: hover crosshair, period tooltip, and click-to-pin selection connected to the period table. The chart still uses the app's Elexon NDF data and leaves null gaps open. |
| [Data Refresh State](https://21st.dev/@rmahammad/components/data-refresh-state) | NDF completeness and publication state | Catalog pattern adapted in `NdfRefreshStatus.tsx` to show refreshing, complete, partial, or unavailable states plus the source publication time. State is derived from the API response; no staleness threshold is invented. |
| [Segmented Control](https://21st.dev/@halaska-studio/components/segmented-control) | 10/20-day history range | Catalog pattern adapted in `DemandHistory.tsx` and `styles.css`; the animated selection stays keyboard-accessible through the existing pressed buttons. |
| [Calendar Basic](https://21st.dev/@uiable/components/calendar-basic) | Select a delivery date | Source retrieved through MCP and integrated as a single-date calendar. It is bounded by the loaded history window and tomorrow. |
| [Table](https://21st.dev/@originui/components/table) | Settlement-period records | Registry install blocked. WindScope keeps its period table so source provenance and unavailable periods remain explicit. |
| [Collapsible](https://21st.dev/@wensity/components/collapsible) | Wind analysis disclosure | Registry install blocked. The existing accessible disclosure remains closed by default. |

## Calendar integration

The single-date calendar is in `src/components/ui/calendar-basic.tsx`, with its DayPicker styling in `src/components/ui/calendar-basic-utils/calendar.tsx`. `src/pages/App.tsx` connects its selected date to the existing `/api/demand/day` request; the chart and period table update together. Dates outside the available history window and tomorrow are disabled.

The frontend uses React Day Picker 8.10.1, date-fns 3.6.0, lucide-react, class-variance-authority, and the existing Recharts dependency. date-fns 3 is used because React Day Picker 8's peer range does not accept date-fns 4. The `@/` project alias is configured in Vite and TypeScript and recorded in `components.json`.

## Registry access limit

The shadcn registry install was attempted for the selected components. 21st.dev rejected the registry request with `Marketplace membership required`; no registry bundle was installed. WindScope uses local adaptations with its existing React and Recharts dependencies. The Progress Metric Card source and Calendar Basic source were retrieved through MCP; the additional catalog patterns were selected from free search metadata. No paid membership or upgrade was purchased.

If 21st.dev Marketplace membership becomes available, the corresponding source packages can be installed from `frontend/` with:

```bash
npm exec --yes --package=shadcn@latest -- shadcn add \
  "https://21st.dev/r/makviesainte/progress-metric-card?api_key=$API_KEY_21ST" \
  "https://21st.dev/r/mirukullacode/chart-line?api_key=$API_KEY_21ST" \
  "https://21st.dev/r/rmahammad/data-refresh-state?api_key=$API_KEY_21ST" \
  "https://21st.dev/r/halaska-studio/segmented-control?api_key=$API_KEY_21ST" \
  --yes
```

`Calendar Basic` is already integrated and is omitted from that command. The registry URLs use `API_KEY_21ST` from the shell environment; this document contains no credential. WindScope's current local adaptations add no new package dependency.
