/**
 * End-to-end smoke test for the Phase 1 flows, written against the built app.
 *
 *   npm run build && npm run preview -- --port 4321 &
 *   npm run smoke
 *
 * CHROME_PATH pins a browser binary, SMOKE_URL the preview origin,
 * SMOKE_SHOTS the screenshot directory.
 */
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL ?? 'http://127.0.0.1:4321/'
const SHOT = process.env.SMOKE_SHOTS ?? '.smoke'
const errors = []

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
ctx.setDefaultTimeout(4000)
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

const pad = () => page.locator('[role=dialog]')
const key = (k) => pad().getByRole('button', { name: k, exact: true }).click()
const type = async (s) => { for (const c of s) await key(c) }
const body = () => page.locator('body').innerText()

const step = async (name, fn) => {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e.message).split('\n')[0]}`)
    errors.push(name)
    await page.screenshot({ path: `${SHOT}/fail-${name.replace(/\W+/g, '-')}.png` })
    await page.keyboard.press('Escape').catch(() => {})
  }
}

await page.goto(BASE)
await page.waitForTimeout(1500)

await step('first run lands on the rate board', async () => {
  await page.waitForSelector('text=Rate Board')
})

await step('buy rate then auto-advance to sell rate', async () => {
  await page.getByRole('button', { name: 'Tomato buy rate' }).click()
  await page.waitForSelector('text=Tomato · Buy rate')
  await type('20')
  await pad().getByRole('button', { name: 'Next', exact: true }).click()
  await page.waitForSelector('text=Tomato · Sell rate')
  await type('30')
  await pad().getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(400)
})

await step('margin percent is computed on the board', async () => {
  if (!(await body()).includes('33%')) throw new Error('no 33% margin shown')
})

await page.screenshot({ path: `${SHOT}/01-rates.png` })

await step('rate board reaches billing in one tap', async () => {
  await page.getByRole('button', { name: 'Bill →' }).click()
  await page.waitForSelector('text=Tap an item to start')
})

await step('two taps add 1 kg of tomato', async () => {
  await page.getByRole('button', { name: 'Tomato', exact: true }).click()
  await pad().getByRole('button', { name: '1 kg', exact: true }).click()
  await page.waitForTimeout(300)
  if (!(await body()).includes('₹30.00')) throw new Error('total is not ₹30 after 1 kg tomato')
})

await page.screenshot({ path: `${SHOT}/02-bill-cart.png` })

await step('unpriced item asks for the rate, then the weight', async () => {
  await page.getByRole('button', { name: 'Onion', exact: true }).click()
  await page.waitForSelector("text=Today's rate · Onion")
  await type('40')
  await pad().getByRole('button', { name: 'Set', exact: true }).click()
  await page.waitForTimeout(300)
  await pad().getByRole('button', { name: '½ kg', exact: true }).click()
  await page.waitForTimeout(300)
  if (!(await body()).includes('₹50.00')) throw new Error('expected ₹50 total, got ' + (await body()).slice(0, 200))
})

await step('one tap on Cash saves and clears the bill', async () => {
  await page.getByRole('button', { name: 'Cash' }).click()
  await page.waitForTimeout(700)
  const t = await body()
  if (!t.includes('Bill #1')) throw new Error('no bill #1 toast')
  if (!t.includes('Tap an item to start')) throw new Error('cart did not clear')
})

await page.screenshot({ path: `${SHOT}/03-after-cash.png` })

await step('udhaar bill creates the customer inline', async () => {
  await page.getByRole('button', { name: 'Tomato', exact: true }).click()
  await pad().getByRole('button', { name: '2 kg', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Udhaar' }).click()
  await page.getByPlaceholder(/Name or phone/).fill('Ramesh Hotel')
  await page.getByRole('button', { name: /Add “Ramesh Hotel”/ }).click()
  await page.waitForTimeout(800)
  if (!(await body()).includes('Bill #2')) throw new Error('udhaar bill not saved')
})

await step('khata shows the outstanding balance', async () => {
  await page.goto(BASE + '#/khata')
  await page.waitForTimeout(600)
  const t = await body()
  if (!t.includes('Ramesh Hotel')) throw new Error('customer missing')
  if (!t.includes('₹60.00')) throw new Error('balance wrong: ' + t.slice(0, 300))
})

await page.screenshot({ path: `${SHOT}/04-khata.png` })

await step('collect full balance in two taps', async () => {
  await page.getByRole('button', { name: '₹ Collect' }).first().click()
  await page.waitForSelector('text=Collect from Ramesh Hotel')
  await pad().getByRole('button', { name: '💵 Cash' }).click()
  await page.waitForTimeout(800)
  if (!(await body()).includes('₹0.00')) throw new Error('balance not cleared')
})

await step('day close totals and margin', async () => {
  await page.goto(BASE + '#/day')
  await page.waitForTimeout(700)
  const t = await body()
  if (!t.includes('₹110.00')) throw new Error('total sales wrong')
  if (!t.includes('2 bills')) throw new Error('bill count wrong')
  if (!t.includes('₹30.00')) throw new Error('gross margin wrong: ' + t.slice(0, 800))
})

await page.screenshot({ path: `${SHOT}/05-day.png`, fullPage: true })

await step('customer ledger shows sale then payment', async () => {
  await page.goto(BASE + '#/khata')
  await page.waitForTimeout(400)
  await page.getByRole('button').filter({ hasText: 'Ramesh Hotel' }).first().click()
  await page.waitForTimeout(600)
  const t = await body()
  if (!t.includes('Bill #2') || !t.includes('Paid cash')) throw new Error('ledger incomplete: ' + t.slice(0, 400))
})

await page.screenshot({ path: `${SHOT}/06-ledger.png` })

await step('backup exports a file', async () => {
  await page.goto(BASE + '#/more')
  await page.waitForTimeout(600)
  const dl = page.waitForEvent('download', { timeout: 8000 })
  await page.getByRole('button', { name: /Backup to file/ }).click()
  if (!(await (await dl).path())) throw new Error('no download')
})

await page.screenshot({ path: `${SHOT}/07-settings.png` })

await step('purchase entry updates the buy rate', async () => {
  await page.goto(BASE + '#/purchase')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '＋ Add item' }).click()
  await page.getByRole('button').filter({ hasText: 'Tomato' }).first().click()
  await page.waitForSelector('text=Quantity bought')
  await type('10')
  await pad().getByRole('button', { name: 'Next', exact: true }).click()
  await page.waitForTimeout(400)
  const t = await body()
  if (!t.includes('₹200.00')) throw new Error('purchase line total wrong: ' + t.slice(0, 400))
  await page.getByRole('button', { name: 'Save purchase' }).click()
  await page.waitForTimeout(800)
  if (!(await body()).includes('buy rates updated')) throw new Error('no rate-update confirmation')
})

await page.screenshot({ path: `${SHOT}/08-purchase.png` })

await step('reload keeps the data (offline-first)', async () => {
  await page.goto(BASE + '#/day')
  await page.reload()
  await page.waitForTimeout(1200)
  if (!(await body()).includes('₹110.00')) throw new Error('data lost after reload')
})

await browser.close()
console.log(errors.length ? `\nFAILURES (${errors.length}): ${errors.join(', ')}` : '\nALL GREEN')
process.exit(errors.length ? 1 : 0)
