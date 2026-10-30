// Canvas units: 64 per centimetre, so every element can be drawn with the
// dimensions quantikz2 gives it in TeX points.
export const CM = 64
export const PT = CM / 28.4528
// Wire pitch, and the narrowest step. Columns widen to fit their gates.
export const ROW = 64
export const COLUMN = 64
// Free space quantikz keeps between neighbouring elements (column sep=0.5cm).
export const COLUMN_GAP = 0.5 * CM
// The wire runs this far past the first and last step.
export const STUB = 16
export const FONT = 10 * PT
export const SMALL_FONT = 7 * PT
export const LINE = 0.8 * PT
export const THIN = 0.4 * PT
export const CLASSICAL_GAP = 0.03 * CM

// Gate presets only differ by their label; every gate is `\gate{label}`.
export const gates = [
  {id: 'H', value: 'H'},
  {id: 'X', value: 'X'},
  {id: 'Y', value: 'Y'},
  {id: 'Z', value: 'Z'},
  {id: 'S', value: 'S'},
  {id: 'T', value: 'T'},
  {id: 'Sdg', value: 'S^\\dagger'},
  {id: 'Tdg', value: 'T^\\dagger'},
  {id: 'Rx', value: 'R_x(\\theta)'},
  {id: 'Ry', value: 'R_y(\\theta)'},
  {id: 'Rz', value: 'R_z(\\theta)'},
  {id: 'U', value: 'U'},
]

// Everything that occupies a single cell of the quantikz matrix.
export const elements = [
  {id: 'ctrl', name: 'Control', description: 'Drag to its target', key: 'C'},
  {id: 'octrl', name: 'Open control', description: 'Drag to its target'},
  {id: 'targ', name: 'Target', description: 'CNOT target'},
  {id: 'swap', name: 'Swap', description: 'Drag to the partner'},
  {id: 'phase', name: 'Phase', description: 'Dot with a label'},
  {id: 'meter', name: 'Measure', description: 'Meter', key: 'M'},
  {id: 'ground', name: 'Ground', description: 'Ends a wire'},
  {id: 'trash', name: 'Discard', description: 'Traced out'},
  {id: 'push', name: 'Text', description: 'Label on the wire'},
  {id: 'bundle', name: 'Bundle', description: 'n qubits'},
]
export const kinds = ['gate', ...elements.map((e) => e.id)]
export const labelled = new Set(['gate', 'meter', 'phase', 'trash', 'push', 'bundle'])
// \gate, \meter and \metercw may cover several wires; other measurements cannot.
export const spans = (i) =>
  i.kind === 'gate' || (i.kind === 'meter' && ['meter', 'metercw'].includes(i.variant))
export const defaultLabels = {gate: 'U', phase: '\\alpha', push: 'X', bundle: 'n'}

export const meterStyles = [
  {id: 'meter', name: 'Meter'},
  {id: 'metercw', name: 'Classical out'},
  {id: 'measure', name: 'Rounded'},
  {id: 'meterD', name: 'D-shape'},
  {id: 'measuretab', name: 'Tab'},
]

export const wireTypes = [
  {id: 'q', name: 'Quantum', description: 'Single line'},
  {id: 'c', name: 'Classical', description: 'Double line'},
  {id: 'b', name: 'Bundle', description: 'Triple line'},
  {id: 'n', name: 'None', description: 'No wire'},
]
export const wireTypeIDs = wireTypes.map((w) => w.id)

export const annotations = [
  {id: 'slice', name: 'Slice', description: 'Between steps', key: 'S'},
  {id: 'group', name: 'Group', description: 'Drag a box', key: 'B'},
]

export const componentName = (id) =>
  gates.find((g) => g.id === id)
    ? 'Gate'
    : (
        elements.find((e) => e.id === id) ||
        annotations.find((a) => a.id === id) ||
        wireTypes.find((w) => 'wire-' + w.id === id)
      )?.name || id
