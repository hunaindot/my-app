/**
 * components/QueryChipBar.jsx
 *
 * Strip between view tabs and content showing every active filter as a chip.
 * Shows "ACTIVE QUERY" label on left, chips with colored dot, Clear all on right.
 */
export default function QueryChipBar({
  info, activeFilters, yearRange, totalVisible,
  onSetGroup, onYearRange, onClear,
}) {
  if (!info) return null

  const chips = []

  // Year chip — default upper bound excludes the current incomplete year
  const defaultMax = info.end_year - 1
  const yearNarrowed = yearRange &&
    (yearRange[0] > info.start_year || yearRange[1] < defaultMax)
  if (yearNarrowed) {
    chips.push({
      key: '__year',
      groupLabel: 'Year',
      valueLabel: `${yearRange[0]}–${yearRange[1]}`,
      colour: null,
      onRemove: () => onYearRange([info.start_year, defaultMax]),
    })
  }

  // One chip per selected label
  for (const [groupKey, selected] of Object.entries(activeFilters)) {
    const group = info.groups[groupKey]
    if (!group) continue
    for (const labelId of selected) {
      const label = group.labels?.[labelId]
      if (!label) continue
      chips.push({
        key: `${groupKey}:${labelId}`,
        groupLabel: group.name,
        valueLabel: label.name,
        colour: label.colour,
        onRemove: () => onSetGroup(groupKey, set => {
          const next = new Set(set); next.delete(labelId); return next
        }),
      })
    }
  }

  if (chips.length === 0) {
    return (
      <div className="flex-shrink-0 px-4 py-1.5 border-b border-gray-100 text-[11px] text-gray-400 bg-white">
        No active filters · {totalVisible.toLocaleString()} papers shown
      </div>
    )
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-gray-200 bg-white overflow-x-auto min-w-0">
      <span className="flex-shrink-0 text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-1">
        Active query
      </span>

      {chips.map(chip => {
        const [h, s, l] = chip.colour ?? [140, 30, 40]
        const dot    = chip.colour ? `hsl(${h},${s}%,${l}%)` : '#2d5238'
        const bg     = chip.colour ? `hsl(${h},${s}%,95%)` : '#eef3ef'
        const fg     = chip.colour ? `hsl(${h},${s}%,20%)` : '#1e3827'
        const border = chip.colour ? `hsl(${h},${s}%,82%)` : '#c5d9c8'

        return (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full text-[11px] px-2 py-0.5 whitespace-nowrap border flex-shrink-0"
            style={{ backgroundColor: bg, color: fg, borderColor: border }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
            <span className="opacity-60 font-medium">{chip.groupLabel}:</span>
            <span className="font-semibold">{chip.valueLabel}</span>
            <button
              onClick={chip.onRemove}
              className="opacity-40 hover:opacity-100 leading-none ml-0.5 font-bold"
              aria-label={`Remove ${chip.groupLabel}: ${chip.valueLabel}`}
            >×</button>
          </span>
        )
      })}

      <button
        onClick={onClear}
        className="ml-auto flex-shrink-0 text-[11px] text-gray-400 hover:text-gray-700 whitespace-nowrap hover:underline"
      >
        Clear all
      </button>
    </div>
  )
}
