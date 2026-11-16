import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'progress-desk',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never,
} as const

const LIST = 'mcp__ccd_turn__update_plan'
const items = [
  { content: 'Read the code', status: 'in_progress' },
  { content: 'Write the fix', status: 'pending' },
  { content: 'Run the tests', status: 'pending' },
  { content: 'Ship it', status: 'pending' },
]

// `opened` collects the ids of the panes the mod opens.
async function session($: Engine, on: On, env: Record<string, string> = {}, opened: string[] = []) {
  const clock = mock.clock(on, { now: Date.parse('2026-11-09T12:00:00Z') })
  mock.env(on, { LANG: 'en_US.UTF-8', ...env })
  on('settings.read', async () => ({ value: {} }) as never)
  on('command.register', async () => ({ value: { command: 'desk' } }) as never)
  on('tool.register', async () => ({ value: { tool: 'mcp__progress-desk__plan' } }) as never)
  on('session.start', async () => ({ cwd: '/repo' }) as never)
  let id = 0
  on('tool.call', async (_, e) =>
    ((e.tool as string) === 'TaskCreate' ? { result: { task: { id: String(++id) } } } : { result: {} }) as never,
  )
  on('agent.spawn', async () => ({ agentId: 'a1', model: 'claude-opus-5-5' }) as never)
  on('ui.open', async (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  await $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

  return clock
}

// The terminal draws the row as text, so the title and the count can be read.
async function bar($: Engine) {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text ?? '')
  await ui.unmount()

  return texts.join(' | ')
}

test('no list, no bar', async ($, on) => {
  await session($, on)
  expect(await bar($)).not.toContain('Tasks')
})

test('the desktop draws the bar as one drawing', async ($, on) => {
  await session($, on)
  await $.tool.call({ tool: LIST, items } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
  await ui.unmount()
})

test('inside Le Fluff the bar is handed over as a drawing, and the terminal draws none of its own', async ($, on) => {
  const written: { path: string; text: string }[] = []
  on('fs.write', async (_, e) => {
    written.push({ path: e.path, text: e.text })

    return { value: undefined } as never
  })
  // Le Fluff names the folder it reads the drawings from.
  const clock = await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1', LEFLUFF_BAND_BUTTONS: '1' })
  type Row = { svg: string; width: number; height: number; alt: string; tail: string }
  const band = () => JSON.parse(written.at(-1)!.text) as { order: number; rows: Row[] }

  // No list yet: the band is handed over empty.
  expect(written.at(-1)!.path.replace(/\\/g, '/')).toBe('C:/bands/chat-1/progress-desk.json')
  expect(band()).toEqual({ order: 20, rows: [] })

  await $.tool.call({ tool: LIST, items } as never)
  // The terminal draws only what is beneath this mod.
  expect(await bar($)).toBe('engine')
  await clock.advance(1000)
  const row = band().rows[0]!
  expect(band().rows.length).toBe(1)
  expect(row.alt).toBe('Read the code: Tasks 0/4, 0%')
  expect(row.svg).toContain('>Tasks 0/4<')
  expect(row.tail).toMatch(/^×\d+$/)
  // 100 columns of Le Fluff's terminal, less the room for the count of agents.
  expect(row.width).toBe(772)
  expect(row.height).toBe(22)
  // Le Fluff is always dark, so the drawing does not ask the system.
  expect(row.svg).not.toContain('prefers-color-scheme: dark')

  // A drawing that did not change is not written again; a step that finishes changes it.
  const count = written.length
  await clock.advance(3000)
  expect(written.length).toBe(count)
  await $.tool.call({ tool: LIST, advance: true } as never)
  await clock.advance(1000)
  expect(band().rows[0]!.alt).toBe('Write the fix: Tasks 1/4, 25%')

  // Inside Le Fluff a finished list stays, until its ✕ is pressed there.
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' } as never)
  await clock.advance(1000)
  expect(band().rows[0]!.alt).toContain('Done')
  await clock.advance(21_000)
  expect(band().rows[0]!.alt).toContain('Done')
})

type SideRow = { svg?: string; width?: number; height?: number; alt?: string; text?: string; button?: { id: string; label: string } }
type Handed = {
  order: number
  rows: { alt: string; buttons: { id: string; label: string }[] }[]
  panel?: { title: string; shown: number; rows: SideRow[]; buttons: { id: string; label: string }[]; close: string }
}

// Le Fluff notes each click on one of the mod's buttons in a file the mod reads. `press` adds one.
function clicks(on: On) {
  const presses: { n: number; id: string }[] = []
  on('fs.read', async (_, e) => {
    if (!e.path.replace(/\\/g, '/').endsWith('/presses/progress-desk.json')) throw new Error('ENOENT')

    return { value: JSON.stringify({ presses }) } as never
  })

  return (id: string) => presses.push({ n: presses.length + 1, id })
}

// The person types /desk, or /desk open.
const desk = ($: Engine, args = '') => $.command.run({ command: 'desk', args } as never)

// Collects what the mod writes into the folder Le Fluff names.
function folder(on: On) {
  const written: string[] = []
  on('fs.write', async (_, e) => {
    written.push(e.text)

    return { value: undefined } as never
  })

  return () => JSON.parse(written.at(-1)!) as Handed
}

test('inside Le Fluff /desk hands the Agents panel over as drawings, and opens no pane', async ($, on) => {
  const handed = folder(on)
  const opened: string[] = []
  const clock = await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1', LEFLUFF_BAND_BUTTONS: '1' }, opened)
  // Closed at the start: no panel.
  expect(handed().panel).toBeUndefined()

  expect((await desk($)).text).toBe('Agents panel opened.')
  // The terminal would draw a pane as text, so none is opened.
  expect(opened).toEqual([])
  const first = handed().panel!
  expect(first.title).toBe('Agents')
  expect(first.shown).toBeGreaterThan(0)
  // The header with Cost, Tokens and Time is a drawing; the rest is in words while no subagent ran.
  expect(first.rows.length).toBe(2)
  expect(first.rows[0]!.width).toBe(440)
  expect(first.rows[0]!.height).toBe(44)
  expect(first.rows[0]!.svg).toContain('>Cost<')
  expect(first.rows[0]!.svg).not.toContain('prefers-color-scheme: dark')
  expect(first.rows[1]).toEqual({ text: 'No subagents yet.' })
  // The band keeps its own rows beside the panel.
  expect(handed().order).toBe(20)

  // A subagent that starts shows as a drawing under its section head. The panel is shown already,
  // so it keeps its number.
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\repo\\src\\main.ts', agentId: 'a1' } as never)
  await clock.advance(1000)
  let side = handed().panel!
  expect(side.shown).toBe(first.shown)
  expect(side.rows.map(row => row.text ?? row.alt)).toEqual(['≈$0.00, 0 tokens, 0:01', 'Running · 1', 'Fix it: Opus 5.5, running'])
  expect(side.rows[2]!.width).toBe(440)
  expect(side.rows[2]!.height).toBe(66)
  // At this width there is room for what the subagent is doing beside its numbers.
  expect(side.rows[2]!.svg).toContain('Reading main.ts')
  expect(side.rows[2]!.svg).toContain('0:01')
  // Its clock ticks once a second, and the drawing follows.
  await clock.advance(1000)
  side = handed().panel!
  expect(side.rows[2]!.svg).toContain('0:02')

  // A second /desk closes it, and /desk open opens it anew with a new number.
  expect((await desk($)).text).toBe('Agents panel closed.')
  expect(handed().panel).toBeUndefined()
  expect((await desk($, 'open')).text).toBe('Agents panel opened.')
  const again = handed().panel!.shown
  expect(again).toBeGreaterThan(first.shown)
  // /desk open on a panel that is shown opens it anew too, so Le Fluff shows one that was hidden there.
  await desk($, 'open')
  expect(handed().panel!.shown).toBeGreaterThan(again)
  expect(opened).toEqual([])
})

test('inside Le Fluff the panel opens by itself when a subagent starts, once', async ($, on) => {
  const handed = folder(on)
  const opened: string[] = []
  await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1', LEFLUFF_BAND_BUTTONS: '1' }, opened)
  await $.tool.call({ tool: LIST, items } as never)
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)
  const side = handed().panel!
  expect(side.rows.map(row => row.text ?? row.alt)).toEqual(['Read the code: ≈$0.00, 0 tokens, 0:00', 'Running · 1', 'Fix it: Opus 5.5, running'])
  // With a to-do list the header names it, and is taller.
  expect(side.rows[0]!.height).toBe(72)
  expect(opened).toEqual([])

  // Closed by hand, it stays closed when the next subagent starts.
  await desk($)
  await $.agent.spawn({ description: 'Test it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't2' } as never)
  expect(handed().panel).toBeUndefined()
})

test("inside Le Fluff the desktop's buttons work: the count, ✕, Collapse and the Finished head", async ($, on) => {
  const handed = folder(on)
  const press = clicks(on)
  // A subagent's turn ends, so it counts as finished.
  on('turn.complete', async () => ({ text: 'Fixed.' }) as never)
  const clock = await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1', LEFLUFF_BAND_BUTTONS: '1' })
  await $.tool.call({ tool: LIST, items } as never)
  await clock.advance(1000)
  // The row hands over the count of agents and ✕ as buttons.
  expect(handed().rows[0]!.buttons).toEqual([
    { id: 'agents', label: '×0' },
    { id: 'dismiss', label: '✕' },
  ])
  expect(handed().panel).toBeUndefined()

  // The count opens the panel, with Collapse in its title line, and its ✕ closes it in the mod.
  press('agents')
  await clock.advance(500)
  let side = handed().panel!
  expect(side.buttons).toEqual([{ id: 'compact', label: 'Collapse' }])
  expect(side.close).toBe('close-agents')

  // A finished subagent's head is a button that folds the finished agents away and back.
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)
  await $.turn.complete({ agentId: 'a1', reason: 'answer', answer: 'Fixed.' } as never)
  await clock.advance(1000)
  side = handed().panel!
  const head = side.rows.find(row => row.button)!
  expect(head.button).toEqual({ id: 'done', label: '▾ Finished · 1' })
  const count = side.rows.length
  press('done')
  await clock.advance(500)
  expect(handed().panel!.rows.find(row => row.button)!.button!.label).toBe('▸ Finished · 1')
  expect(handed().panel!.rows.length).toBe(count - 1)
  press('done')
  await clock.advance(500)
  expect(handed().panel!.rows.length).toBe(count)

  // Collapse leaves one small drawing, and Expand brings the whole panel back.
  press('compact')
  await clock.advance(500)
  side = handed().panel!
  expect(side.buttons).toEqual([{ id: 'compact', label: 'Expand' }])
  expect(side.rows.length).toBe(1)
  expect(side.rows[0]!.height).toBe(32)
  press('compact')
  await clock.advance(500)
  expect(handed().panel!.rows.length).toBeGreaterThan(1)

  // The count again closes it. The panel's ✕ only closes: pressed on a closed panel, it opens nothing.
  press('agents')
  press('close-agents')
  await clock.advance(500)
  expect(handed().panel).toBeUndefined()
  press('agents')
  await clock.advance(500)
  expect(handed().panel).toBeDefined()
  press('close-agents')
  await clock.advance(500)
  expect(handed().panel).toBeUndefined()

  // ✕ takes the bar away. Each click is answered once.
  press('dismiss')
  await clock.advance(500)
  expect(handed().rows).toEqual([])
  await clock.advance(3000)
  expect(handed().rows).toEqual([])
  expect(handed().panel).toBeUndefined()
})

test('in a Le Fluff that does not draw buttons yet, a finished bar still goes away by itself', async ($, on) => {
  const handed = folder(on)
  const press = clicks(on)
  const clock = await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1' })
  await $.tool.call({ tool: LIST, items } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' } as never)
  await clock.advance(1000)
  expect(handed().rows[0]!.alt).toContain('Done')
  // Such a Le Fluff notes no clicks, so none is looked for.
  press('agents')
  await clock.advance(21_000)
  expect(handed().rows).toEqual([])
  expect(handed().panel).toBeUndefined()
})

test('clicks from before a start are not answered again', async ($, on) => {
  const handed = folder(on)
  const press = clicks(on)
  press('agents')
  const clock = await session($, on, { LEFLUFF_BAND: 'C:\\bands\\chat-1', LEFLUFF_BAND_BUTTONS: '1' })
  await clock.advance(1000)
  expect(handed().panel).toBeUndefined()
  press('agents')
  await clock.advance(500)
  expect(handed().panel).toBeDefined()
})

test('a helper that calls the plan tool gets an answer instead of an error, and the bar stays as it is', async ($, on) => {
  await session($, on)
  await $.tool.call({ tool: LIST, items } as never)
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)
  const said = (await $.tool.call({ tool: 'mcp__progress-desk__plan', steps: [{ text: 'Mine', status: 'in_progress' }], agentId: 'a1' } as never)) as {
    result?: unknown
  }
  expect(String(said.result)).toBe('Only the main chat keeps a plan. Carry on with your task.')
  expect(await bar($)).toContain('Tasks 0/4')
})

test('outside Le Fluff /desk and a subagent open the pane as before, and nothing is handed over', async ($, on) => {
  let writes = 0
  on('fs.write', async () => {
    writes++

    return { value: undefined } as never
  })
  on('ui.panes', async () => ({ value: [] }) as never)
  const opened: string[] = []
  await session($, on, {}, opened)
  expect((await desk($)).text).toBe('Agents panel opened.')
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)
  expect(opened).toEqual(['desk-agents', 'desk-agents'])
  expect(writes).toBe(0)
})

test("the desktop app's task list drives the bar", async ($, on) => {
  await session($, on)

  await $.tool.call({ tool: LIST, items } as never)
  let shown = await bar($)
  expect(shown).toContain('Tasks 0/4')
  expect(shown).toContain('Read the code')

  await $.tool.call({ tool: LIST, advance: true } as never)
  shown = await bar($)
  expect(shown).toContain('Tasks 1/4')
  expect(shown).toContain('Write the fix')

  await $.tool.call({ tool: LIST, done: [2], start: 4 } as never)
  shown = await bar($)
  expect(shown).toContain('Tasks 2/4')
  expect(shown).toContain('Ship it')

  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' } as never)
  expect(await bar($)).toContain('Done')
})

test('a finished bar hides by itself, and a new list brings it back', async ($, on) => {
  const clock = await session($, on)
  await $.tool.call({ tool: LIST, items } as never)
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' } as never)
  await clock.advance(21_000)
  expect(await bar($)).not.toContain('Done')

  await $.tool.call({ tool: LIST, items } as never)
  expect(await bar($)).toContain('Tasks 0/4')
})

test("the mod's own plan tool drives the bar", async ($, on) => {
  await session($, on)
  const said = (await $.tool.call({
    tool: 'mcp__progress-desk__plan',
    steps: [
      { text: 'One', status: 'completed' },
      { text: 'Two', status: 'in_progress' },
    ],
  } as never)) as { result?: unknown }
  expect(String(said.result)).toBe('Drawn: 1 of 2 steps done.')
  const shown = await bar($)
  expect(shown).toContain('Tasks 1/2')
  expect(shown).toContain('Two')
})

test('with no list seen, one reminder comes on the second tool call', async ($, on) => {
  await session($, on)
  const call = async () => ((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)) as { context?: string[] }).context ?? []
  expect(await call()).toEqual([])
  expect((await call()).join(' ')).toContain('mcp__progress-desk__plan')
  expect(await call()).toEqual([])
})

test('no reminder once a list has been seen', async ($, on) => {
  await session($, on)
  await $.tool.call({ tool: LIST, items } as never)
  for (let i = 0; i < 3; i++) {
    expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as never)) as { context?: string[] }).context ?? []).toEqual([])
  }
})

test('TodoWrite drives the bar', async ($, on) => {
  await session($, on)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'One', status: 'completed', activeForm: 'x' },
      { content: 'Two', status: 'in_progress', activeForm: 'x' },
    ],
  } as never)
  const shown = await bar($)
  expect(shown).toContain('Tasks 1/2')
  expect(shown).toContain('Two')
})

test('TaskCreate and TaskUpdate drive the bar', async ($, on) => {
  await session($, on)
  await $.tool.call({ tool: 'TaskCreate', subject: 'First', description: 'x' } as never)
  await $.tool.call({ tool: 'TaskCreate', subject: 'Second', description: 'x' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' } as never)
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' } as never)
  const shown = await bar($)
  expect(shown).toContain('Tasks 1/2')
  expect(shown).toContain('Second')
})

test("a subagent's own list stays off the bar, and the panel shows what it is doing", async ($, on) => {
  await session($, on)
  await $.agent.spawn({ description: 'Fix it', subagentType: 'general-purpose', prompt: 'go', tool_use_id: 't1' } as never)

  await $.tool.call({ tool: LIST, items, agentId: 'a1' } as never)
  expect(await bar($)).not.toContain('Tasks')

  await $.tool.call({ tool: 'Read', file_path: 'C:\\repo\\src\\main.ts', agentId: 'a1' } as never)
  const ui = await $.ui.mount({
    plugin: 'progress-desk',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'desk-agents',
    props: { title: 'Agents', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  } as never)
  expect((await ui.find({ type: 'Text', text: /Reading main\.ts/ }))?.text).toContain('Reading main.ts')
  await ui.unmount()
})
