const render = require('preact-render-to-string')
const cheerio = require('cheerio')
const { html } = require('../../utils')

const Button = require('../Button.js')

test('Button displays properly', () => {
  expect(1).toBe(1)
  const $ = cheerio.load(
    render(
      html`
        <${Button} id="click-button" type="click">Click me</button>
      `,
    ),
  )

  expect($('button').length).toBe(1)
  expect($('button').attr('id')).toEqual('click-button')
  expect($('button').attr('type')).toEqual('click')
  expect($('button').text()).toEqual('Click me')
})