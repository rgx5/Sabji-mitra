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


await step('new customer captures name and phone', async () => {
  await page.goto(BASE + '#/khata')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '＋ New' }).click()
  await page.waitForSelector('text=New customer')
  await page.getByPlaceholder('Ramesh Hotel').fill('Sunita Mess')
  await page.getByPlaceholder('98xxxxxxxx').fill('9876500011')
  await page.getByPlaceholder('Shop 4, Market Road').fill('Lane 3, Mandai')
  await page.getByPlaceholder('5000').fill('2000')
  await page.getByRole('button', { name: 'Add customer' }).click()
  await page.waitForTimeout(800)
  const t = await body()
  if (!t.includes('Sunita Mess')) throw new Error('customer not created')
  if (!t.includes('9876500011')) throw new Error('phone not saved: ' + t.slice(0, 300))
  if (!t.includes('Lane 3, Mandai')) throw new Error('address not saved')
  if (!t.includes('Limit ₹2000.00')) throw new Error('credit limit not saved: ' + t.slice(0, 400))
})

await page.screenshot({ path: `${SHOT}/09-customer.png` })

await step('editing a customer keeps the details', async () => {
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.waitForSelector('text=Edit customer')
  await page
    .getByPlaceholder('98xxxxxxxx')
    .and(page.locator('input[value="9876500011"], input'))
    .first()
    .waitFor()
  await page.waitForFunction(
    () =>
      document.querySelector('input[placeholder="98xxxxxxxx"]') instanceof HTMLInputElement &&
      document.querySelector('input[placeholder="98xxxxxxxx"]').value.length > 0,
  )
  const phone = await page.getByPlaceholder('98xxxxxxxx').inputValue()
  if (phone !== '9876500011') throw new Error('edit form did not load the phone: ' + phone)
  await page.getByPlaceholder('98xxxxxxxx').fill('9876500022')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(700)
  if (!(await body()).includes('9876500022')) throw new Error('phone edit not saved')
})

await step('bills list shows every bill', async () => {
  await page.goto(BASE + '#/bills')
  await page.waitForTimeout(700)
  const t = await body()
  if (!t.includes('#1') || !t.includes('#2')) throw new Error('bills missing from the list: ' + t.slice(0, 500))
  if (!t.includes('₹110.00')) throw new Error('bills total wrong: ' + t.slice(0, 500))
})

await page.screenshot({ path: `${SHOT}/10-bills.png` })

await step('a bill opens its full receipt', async () => {
  await page.getByRole('button').filter({ hasText: '#2' }).first().click()
  await page.waitForSelector('text=Bill #2')
  await page.waitForSelector('text=2 kg × ₹30/kg')
  const t = await body()
  if (!t.includes('Tomato')) throw new Error('receipt has no items: ' + t.slice(0, 400))
  if (!t.includes('Ramesh Hotel')) throw new Error('receipt does not name the customer')
  if (!t.includes('📒 Udhaar')) throw new Error('receipt does not break out the payment')
})

await page.screenshot({ path: `${SHOT}/11-receipt.png` })

await step('bill search finds by customer name', async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByPlaceholder('Bill no. or customer').fill('Ramesh')
  await page.waitForTimeout(400)
  const t = await body()
  if (!t.includes('#2')) throw new Error('search lost the matching bill')
  if (t.includes('#1 ·') || /#1\n/.test(t)) throw new Error('search kept a non-matching bill')
  await page.getByPlaceholder('Bill no. or customer').fill('')
})

await step('purchases tab lists saved purchases', async () => {
  await page.getByRole('button', { name: '🚚 Purchases' }).click()
  await page.waitForTimeout(500)
  const t = await body()
  if (!t.includes('₹200.00')) throw new Error('purchase missing: ' + t.slice(0, 500))
  await page.getByRole('button').filter({ hasText: 'Mandi purchase' }).first().click()
  await page.waitForTimeout(400)
  if (!(await body()).includes('Tomato')) throw new Error('purchase receipt has no lines')
  await page.keyboard.press('Escape')
})

await page.screenshot({ path: `${SHOT}/12-purchases.png` })

await step('udhaar picker can add a customer with phone', async () => {
  await page.goto(BASE + '#/bill')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Tomato', exact: true }).click()
  await pad().getByRole('button', { name: '1 kg', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Udhaar' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /New customer with phone/ }).click()
  await page.waitForSelector('text=New customer')
  await page.getByPlaceholder('Ramesh Hotel').fill('Kirana Corner')
  await page.getByPlaceholder('98xxxxxxxx').fill('9800011122')
  await page.getByRole('button', { name: 'Add customer' }).click()
  await page.waitForTimeout(900)
  const t = await body()
  if (!t.includes('Bill #3')) throw new Error('bill not saved through the details path: ' + t.slice(0, 400))
})

await step('the new khata customer carries the phone', async () => {
  await page.goto(BASE + '#/khata')
  await page.waitForTimeout(700)
  const t = await body()
  if (!t.includes('Kirana Corner') || !t.includes('9800011122')) {
    throw new Error('customer or phone missing in khata: ' + t.slice(0, 500))
  }
})

await browser.close()
console.log(errors.length ? `\nFAILURES (${errors.length}): ${errors.join(', ')}` : '\nALL GREEN')
process.exit(errors.length ? 1 : 0)
