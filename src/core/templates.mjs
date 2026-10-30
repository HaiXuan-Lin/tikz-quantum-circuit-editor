import {fromTeX} from './tex.mjs'

// Each template is written as the quantikz source one would type by hand and
// opened through the same importer as pasted code.
const sources = [
  {
    id: 'bell',
    name: 'Bell pair',
    category: 'Entanglement',
    subtitle: 'Hadamard and CNOT',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}} & \gate{H} & \ctrl{1} & \\
\lstick{\ket{0}} &          & \targ{}  &
\end{quantikz}`,
  },
  {
    id: 'ghz',
    name: 'GHZ state',
    category: 'Entanglement',
    subtitle: 'Three entangled qubits',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}} & \gate{H} & \ctrl{1} &          & \\
\lstick{\ket{0}} &          & \targ{}  & \ctrl{1} & \\
\lstick{\ket{0}} &          &          & \targ{}  &
\end{quantikz}`,
  },
  {
    id: 'teleportation',
    name: 'Teleportation',
    category: 'Protocol',
    subtitle: 'Measurements feed classical corrections',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{\psi}} &          &          & \ctrl{1} & \gate{H} & \meter{} & \setwiretype{c} & \ctrl[vertical wire=c]{2} & \setwiretype{n} \\
\lstick{\ket{0}}    & \gate{H} & \ctrl{1} & \targ{}  &          & \meter{} & \ctrl[vertical wire=c]{1}\setwiretype{c} & \setwiretype{n} & \\
\lstick{\ket{0}}    &          & \targ{}  &          &          &          & \gate{X} & \gate{Z} & \rstick{\ket{\psi}}
\end{quantikz}`,
  },
  {
    id: 'superdense',
    name: 'Superdense coding',
    category: 'Protocol',
    subtitle: 'Two bits through one qubit',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}} & \gate{H} & \ctrl{1} & \gate{X^{b}} & \gate{Z^{a}} & \ctrl{1} & \gate{H} & \meter{} & \setwiretype{c} \rstick{$a$} \\
\lstick{\ket{0}} &          & \targ{}  &              &              & \targ{}  &          & \meter{} & \setwiretype{c} \rstick{$b$}
\end{quantikz}`,
  },
  {
    id: 'deutsch-jozsa',
    name: 'Deutsch–Jozsa',
    category: 'Algorithm',
    subtitle: 'An n-qubit register and an oracle',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}^{\otimes n}} & \qwbundle{n} & \gate{H^{\otimes n}} & \gate[2]{U_f} & \gate{H^{\otimes n}} & \meter{} \\
\lstick{\ket{1}}             &              & \gate{H}             &               &                      &
\end{quantikz}`,
  },
  {
    id: 'qft',
    name: 'Fourier transform',
    category: 'Algorithm',
    subtitle: 'Three-qubit QFT with a final swap',
    tex: String.raw`
\begin{quantikz}
& \gate{H} & \gate{R_2} & \gate{R_3} &          &            &          & \swap{2}  & \\
&          & \ctrl{-1}  &            & \gate{H} & \gate{R_2} &          &           & \\
&          &            & \ctrl{-2}  &          & \ctrl{-1}  & \gate{H} & \targX{}  &
\end{quantikz}`,
  },
  {
    id: 'grover',
    name: 'Grover search',
    category: 'Algorithm',
    subtitle: 'One iteration on two qubits',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}} & \gate{H} & \ctrl{1}\gategroup[2,steps=1,style={dashed,rounded corners},background]{\text{Oracle}} & \gate{H}\gategroup[2,steps=5,style={dashed,rounded corners},background]{\text{Diffusion}} & \gate{X} & \ctrl{1} & \gate{X} & \gate{H} & \meter{} \\
\lstick{\ket{0}} & \gate{H} & \control{} & \gate{H} & \gate{X} & \control{} & \gate{X} & \gate{H} & \meter{}
\end{quantikz}`,
  },
  {
    id: 'swap-test',
    name: 'Swap test',
    category: 'Algorithm',
    subtitle: 'Controlled swap between two states',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}}    & \gate{H} & \ctrl{1}  & \gate{H} & \meter{} \\
\lstick{\ket{\phi}} &          & \swap{1}  &          & \\
\lstick{\ket{\psi}} &          & \targX{}  &          &
\end{quantikz}`,
  },
  {
    id: 'phase-estimation',
    name: 'Phase estimation',
    category: 'Algorithm',
    subtitle: 'Controlled powers and an inverse QFT',
    tex: String.raw`
\begin{quantikz}
\lstick{\ket{0}} & \gate{H} &          &            & \ctrl{3}   & \gate[3]{\mathrm{QFT}^\dagger} & \meter{} \\
\lstick{\ket{0}} & \gate{H} &          & \ctrl{2}   &            &                               & \meter{} \\
\lstick{\ket{0}} & \gate{H} & \ctrl{1} &            &            &                               & \meter{} \\
\lstick{\ket{u}} & \qwbundle{m} & \gate{U} & \gate{U^2} & \gate{U^4} &                           &
\end{quantikz}`,
  },
  {
    id: 'toffoli',
    name: 'Toffoli gate',
    category: 'Decomposition',
    subtitle: 'Clifford+T, six CNOTs',
    tex: String.raw`
\begin{quantikz}
&          &          &              & \ctrl{2} &          &          &              & \ctrl{2} &          &          & \ctrl{1} & \gate{T}           & \ctrl{1} & \\
&          & \ctrl{1} &              &          &          & \ctrl{1} &              &          & \gate{T} &          & \targ{}  & \gate{T^\dagger}   & \targ{}  & \\
& \gate{H} & \targ{}  & \gate{T^\dagger} & \targ{} & \gate{T} & \targ{} & \gate{T^\dagger} & \targ{} & \gate{T} & \gate{H} &   &                    &          &
\end{quantikz}`,
  },
]

export const templates = sources.map((template) => ({
  ...template,
  create: () => ({...fromTeX(template.tex).circuit, title: template.name}),
}))
export const getTemplate = (id) => templates.find((t) => t.id === id)
