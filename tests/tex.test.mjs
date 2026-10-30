import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp, writeFile, rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {emptyCircuit, item, slice, group, place, setSegments} from '../src/core/model.mjs'
import {toTeX, fromTeX, textArgument, PREAMBLE} from '../src/core/tex.mjs'
import {templates, getTemplate} from '../src/core/templates.mjs'
import {elements, meterStyles} from '../src/core/catalog.mjs'

const body = (tex) => tex.split('\n').slice(1, -1)

test('a Bell pair exports the quantikz a person would write', () => {
  assert.equal(
    toTeX(getTemplate('bell').create()),
    [
      '\\begin{quantikz}',
      '\\lstick{\\ket{0}} & \\gate{H} & \\ctrl{1} & \\\\',
      '\\lstick{\\ket{0}} &          & \\targ{}  &',
      '\\end{quantikz}',
    ].join('\n'),
  )
})

test('rows without input labels start at their first cell', () => {
  let c = emptyCircuit(2, 1)
  c = place(c, item('swap', 0, 0, {link: 1}))
  c = place(c, item('swap', 1, 0))
  assert.deepEqual(body(toTeX(c)), ['& \\swap{1} & \\\\', '& \\targX{} &'])
})

test('wire types become the wire types key and \\setwiretype in later cells', () => {
  let c = emptyCircuit(2, 3)
  c = place(c, item('meter', 0, 1))
  c = setSegments(c, 0, 2, 3, 'c')
  c = setSegments(c, 1, 0, 1, 'n')
  const tex = toTeX(c)
  assert.match(tex, /^\\begin\{quantikz\}\[wire types=\{q,n\}\]/)
  const [first, second] = body(tex)
  assert.equal(first, '& & \\meter{} & \\setwiretype{c} & \\\\')
  assert.equal(second, '& &          & \\setwiretype{q} &')
})

test('vertical wires use the native command, or \\wire on other elements', () => {
  let c = emptyCircuit(3, 3)
  c = place(c, item('ctrl', 0, 0, {link: 2, linkType: 'c'}))
  c = place(c, item('octrl', 2, 1, {link: -1}))
  c = place(c, item('meter', 0, 2, {link: 2, linkType: 'c'}))
  c = place(c, item('gate', 2, 2, {value: 'X', link: -1}))
  const tex = toTeX(c)
  assert.match(tex, /\\ctrl\[vertical wire=c\]\{2\}/)
  assert.match(tex, /\\octrl\{-1\}/)
  assert.match(tex, /\\meter\{\}\\wire\[d\]\[2\]\{c\}/)
  assert.match(tex, /\\gate\{X\}\\wire\[u\]\[1\]\{q\}/)
})

test('every element and measurement style has its quantikz command', () => {
  for (const e of elements) {
    const tex = toTeX(place(emptyCircuit(1, 1), item(e.id, 0, 0)))
    assert.match(body(tex)[0], /^& \\[a-zA-Z]+(\[[^\]]*\])?\{[^}]*\} &$/, e.id)
  }
  for (const m of meterStyles) {
    const tex = toTeX(place(emptyCircuit(1, 1), item('meter', 0, 0, {variant: m.id})))
    assert.ok(tex.includes(`\\${m.id}{}`), m.id)
  }
  const tall = toTeX(place(emptyCircuit(2, 1), item('meter', 0, 0, {span: 2})))
  assert.match(tall, /\\meter\[2\]\{\}/)
})

test('slices, groups and spanning labels are written into their cells', () => {
  let c = emptyCircuit(2, 3)
  c.wires[0] = {...c.wires[0], input: '\\text{input}', inputSpan: 2, output: 'x_1'}
  c = {
    ...c,
    slices: [slice(0, '\\text{step}')],
    groups: [group(0, 1, 2, 2, {value: '\\text{Oracle}'})],
  }
  const tex = toTeX(c)
  assert.match(
    body(tex)[0],
    /^\\lstick\[2\]\{input\} & \\slice\{step\} *& \\gategroup\[2,steps=2,style=\{dashed,rounded corners\},background\]\{Oracle\} & +& \\rstick\{\$x_1\$\} \\\\$/,
  )
})

test('text arguments keep math in dollars and plain words as text', () => {
  assert.equal(textArgument('\\ket{0}'), '\\ket{0}')
  assert.equal(textArgument('\\braket{a}{b}'), '\\braket{a}{b}')
  assert.equal(textArgument('\\text{input}'), 'input')
  assert.equal(textArgument('\\text{a} + \\text{b}'), '$\\text{a} + \\text{b}$')
  assert.equal(textArgument('q_0'), '$q_0$')
  assert.equal(textArgument('  '), '')
})

test('standalone documents load the quantikz2 preamble', () => {
  const tex = toTeX(getTemplate('bell').create(), {standalone: true})
  assert.ok(tex.includes(PREAMBLE))
  assert.match(tex, /^\\documentclass\[border=6pt\]\{standalone\}/)
  assert.match(tex, /\\end\{document\}\n$/)
})

test('exported LaTeX reads back to the same circuit', () => {
  for (const template of templates) {
    const tex = toTeX(template.create())
    const {circuit, warnings} = fromTeX(tex)
    assert.deepEqual(warnings, [], template.id)
    assert.equal(toTeX(circuit), tex, template.id)
  }
})

test('importing tutorial-style source', () => {
  const {circuit, warnings} = fromTeX(String.raw`
    % comments and \\[1cm] spacing are ignored
    \begin{quantikz}[wire types={q,c}, row sep={0.8cm,between origins}, thin lines]
    \lstick{$q_0$} & \gate{H} & \ctrl[wire style={"s"}]{1} & \meter{} \\[1cm]
    \lstick{input} & \wave & \targ{} & \push{X} & \rstick{out}
    \end{quantikz}`)
  assert.deepEqual(warnings, ['\\wave'])
  assert.equal(circuit.cols, 3)
  assert.equal(circuit.options.rowSep, 0.8)
  assert.equal(circuit.options.thinLines, true)
  assert.equal(circuit.wires[0].input, 'q_0')
  assert.equal(circuit.wires[1].input, '\\text{input}')
  assert.equal(circuit.wires[1].output, '\\text{out}')
  assert.deepEqual(circuit.wires[1].segments, ['c', 'c', 'c', 'c'])
  // The first row stops at its meter, one cell short of the others.
  assert.deepEqual(circuit.wires[0].segments, ['q', 'q', 'q', 'n'])
  assert.deepEqual(
    circuit.items.map((i) => [i.kind, i.row, i.col, i.link]),
    [
      ['gate', 0, 0, 0],
      ['ctrl', 0, 1, 1],
      ['meter', 0, 2, 0],
      ['targ', 1, 1, 0],
      ['push', 1, 2, 0],
    ],
  )
})

test('a second vertical wire moves to the element at its other end', () => {
  const {circuit} = fromTeX(String.raw`\begin{quantikz}
& \ctrl{2} & \gate{U} & \\
& \targ{} & \ctrl{1}\wire[u]{q} & \\
& \targ{} & \gate{V} &
\end{quantikz}`)
  const u = circuit.items.find((i) => i.value === 'U')
  assert.equal(u.link, 1)
  assert.match(toTeX(circuit), /\\gate\{U\}\\wire\[d\]\[1\]\{q\}/)
})

test('importing rejects text without a quantikz environment', () => {
  assert.throws(() => fromTeX('\\begin{tikzpicture}\\end{tikzpicture}'), /quantikz/)
  assert.throws(() => fromTeX('\\begin{quantikz} & \\gate{H} &'), /not closed/)
})

// Compiles every template and one circuit with every element and option.
const latex = spawnSync('kpsewhich', ['tikzlibraryquantikz2.code.tex'], {
  encoding: 'utf8',
})
test(
  'every template and element compiles with pdflatex and quantikz2',
  {skip: latex.status !== 0 && 'pdflatex with quantikz2 is not installed'},
  async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quantikz-test-'))
    t.after(() => rm(directory, {recursive: true, force: true}))
    let everything = emptyCircuit(3, 1)
    for (const [k, e] of elements.entries())
      everything = place(everything, item(e.id, k % 3, Math.floor(k / 3) + 1))
    for (const [k, m] of meterStyles.entries())
      everything = place(
        everything,
        item('meter', k % 3, 6 + Math.floor(k / 3), {variant: m.id}),
      )
    everything = place(everything, item('ctrl', 0, 9, {link: 2, linkType: 'c'}))
    everything = place(everything, item('gate', 1, 10, {span: 2, value: 'U', link: -1}))
    everything = setSegments(everything, 2, 0, 3, 'b')
    everything = setSegments(everything, 1, 7, 11, 'c')
    everything.wires[0] = {...everything.wires[0], input: '\\text{in}', inputSpan: 3}
    everything.wires[2] = {...everything.wires[2], output: '\\ket{\\psi}'}
    everything = {
      ...everything,
      slices: [slice(-1, 's'), slice(4)],
      groups: [group(0, 2, 2, 3, {value: 'g'}), group(1, 8, 1, 1, {dashed: false})],
      options: {rowSep: 1, columnSep: 0.4, thinLines: true},
    }
    const circuits = [...templates.map((template) => template.create()), everything]
    const source = [
      '\\documentclass{article}',
      PREAMBLE,
      '\\begin{document}',
      ...circuits.map((c) => toTeX(c) + '\n\n'),
      '\\end{document}',
    ].join('\n')
    await writeFile(path.join(directory, 'circuits.tex'), source)
    const result = spawnSync(
      'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', 'circuits.tex'],
      {cwd: directory, encoding: 'utf8', timeout: 120000},
    )
    assert.equal(
      result.status,
      0,
      result.stdout
        .split('\n')
        .filter((l) => l.startsWith('!'))
        .join('\n'),
    )
  },
)
