const request = require('supertest')
const db = require('sqlite')
const Promise = require('bluebird')
const app = require('../../server.js')
const cheerio = require('cheerio')
const { ALLOWED_YEARS } = require('../../config/vars.config')
const { getCurrentHolidayYear } = require('../../utils')

describe('Test ui responses', () => {
  const currentYear = getCurrentHolidayYear()
  const GOOD_YEARS = ALLOWED_YEARS.filter((y) => y !== currentYear)

  beforeAll(async () => {
    await Promise.resolve()
      // First, try to open the database
      .then(() => db.open('./database.sqlite', { Promise, cached: true })) // <=
      // Update db schema to the latest version using SQL-based migrations
      .then(() => db.migrate()) // <=
      // Display error message if something went wrong
      .catch((err) => console.error(err.stack)) // eslint-disable-line no-console
  })

  afterAll(() => {
    db.close()
  })

  describe('Test / response', () => {
    test('it should return 200', async () => {
      const response = await request(app).get('/')
      expect(response.statusCode).toBe(200)
    })

    test('it should return the h1, title, meta tag, and canonical link', async () => {
      const response = await request(app).get('/')
      const $ = cheerio.load(response.text)
      expect($('h1 > div').text()).toMatch(/^Canada’s next holiday\u00a0is/)
      expect($('title').text()).toEqual('Canadian statutory holidays in 2020')
      expect($('meta[name="description"]').attr('content')).toMatch(
        /^Canada’s next stat holiday is/,
      )
      expect($('meta[name="description"]').attr('content')).toMatch(
        /See all \d{1,2} statutory holidays in Canada in 2020./,
      )
      expect($('meta[name="description"]').attr('content')).toMatch(
        /^Canada’s next stat holiday is/,
      )
      expect($('link[rel="canonical"]').attr('href')).toEqual('https://canada-holidays.ca/')
    })

    test('it should NOT return a CORS header', async () => {
      const response = await request(app).get('/')
      expect(response.headers['access-control-allow-origin']).toBe(undefined)
    })
  })

  describe('Test /:year responses', () => {
    test('it should return the h1, title, meta tag, and canonical link for 2021', async () => {
      const response = await request(app).get('/2021')
      const $ = cheerio.load(response.text)
      expect($('h1').text()).toEqual('Canadastatutory Holidays in 2021')
      expect($('title').text()).toEqual('Canadian statutory holidays in 2021')
      expect($('meta[name="description"]').attr('content')).toMatch(
        /See all \d{1,2} statutory holidays in Canada in 2021./,
      )
      expect($('link[rel="canonical"]').attr('href')).toEqual('https://canada-holidays.ca/2021')
    })
  })

  describe('Test /provinces responses', () => {
    describe('Test /provinces GET response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/provinces')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/provinces')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('All regions in Canada')
        expect($('title').text()).toEqual('All regions in Canada — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Upcoming stat holidays for all regions in Canada. See all federal statutory holidays in Canada in 2020.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/provinces',
        )
      })
    })

    describe('Test /provinces POST response', () => {
      test('it should return 302 to / for no params', async () => {
        const response = await request(app).post('/provinces')
        expect(response.statusCode).toBe(302)
        expect(response.headers.location).toBe('/')
      })

      describe('for param "region"', () => {
        test('it should return 302 to /federal for "federal"', async () => {
          const response = await request(app).post('/provinces').send({ region: 'federal' })
          expect(response.statusCode).toBe(302)
          expect(response.headers.location).toBe('/federal')
        })

        test('it should return 302 to /provinces/:id for a good param', async () => {
          const response = await request(app).post('/provinces').send({ region: 'AB' })
          expect(response.statusCode).toBe(302)
          expect(response.headers.location).toBe('/provinces/AB')
        })

        const params = [
          { region: 'AB', url: '/provinces/AB' },
          { region: 'ab', url: '/provinces/AB' },
          { region: 'Alberta', url: '/provinces/AL' },
          { region: 'a', url: '/provinces/A' },
          { region: '<script>', url: '/provinces/%3CS' },
          { region: 'https://evil.org', url: '/provinces/HT' },
          { region: 'false', url: '/provinces/FA' },
          { region: '1', url: '/provinces/1' },
        ]
        params.map((p) => {
          test(`it should return 302 to ${p.url} uppercased for param: '${p.region}'`, async () => {
            const response = await request(app).post('/provinces').send({ region: p.region })
            expect(response.statusCode).toBe(302)
            expect(response.headers.location).toBe(p.url)
          })
        })
      })

      describe('for param "year"', () => {
        test('it should return no year path for current year', async () => {
          const response = await request(app).post('/provinces').send({ year: '2020' })
          expect(response.statusCode).toBe(302)
          expect(response.headers.location).toBe('/')
        })

        GOOD_YEARS.map((year) => {
          test(`it should return a year path for a good year: "${year}`, async () => {
            const response = await request(app).post('/provinces').send({ year })
            expect(response.statusCode).toBe(302)
            expect(response.headers.location).toBe(`/${year}`)
          })
        })

        const BAD_YEARS = ['2016', '2017', '2023', '2024', '1', 'false', 'diplodocus']
        BAD_YEARS.map((badYear) => {
          test(`it should return no year path for an invalid year: "${badYear}`, async () => {
            const response = await request(app).post('/provinces').send({ badYear })
            expect(response.statusCode).toBe(302)
            expect(response.headers.location).toBe('/')
          })
        })

        describe('for param "region" AND param "year"', () => {
          const params = [
            { region: 'AB', year: '1000', url: '/provinces/AB' },
            { region: 'federal', year: '1000', url: '/federal' },
            { region: '', year: '1000', url: '/' },
            { region: 'AB', year: '2021', url: '/provinces/AB/2021' },
            { region: 'federal', year: '2021', url: '/federal/2021' },
            { region: '', year: '2021', url: '/2021' },
            { region: 'AB', year: '2020', url: '/provinces/AB' },
            { region: 'federal', year: '2020', url: '/federal' },
            { region: '', year: '2020', url: '/' },
          ]
          params.map((p) => {
            test(`it should return 302 to ${p.url} for params: region:'${p.region}' year:'${p.year}'`, async () => {
              const response = await request(app)
                .post('/provinces')
                .send({ region: p.region, year: p.year })
              expect(response.statusCode).toBe(302)
              expect(response.headers.location).toBe(p.url)
            })
          })
        })
      })
    })
  })

  describe('Test /provinces/:provinceId responses', () => {
    describe('for a good provinceId', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/provinces/MB')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical response', async () => {
        const response = await request(app).get('/provinces/MB')
        const $ = cheerio.load(response.text)
        expect($('h1 .visible').text()).toMatch(/^Manitoba’s next holiday\u00a0is/)
        expect($('title').text()).toEqual(
          'Manitoba (MB) statutory holidays in 2020 — Canada Holidays',
        )
        expect($('meta[name="description"]').attr('content')).toMatch(
          /^Manitoba’s next stat holiday is/,
        )
        expect($('meta[name="description"]').attr('content')).toMatch(
          /See all \d{1,2} statutory holidays in Manitoba, Canada in 2020/,
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/provinces/MB',
        )
      })
    })

    describe('Test /provinces/PEI response', () => {
      test('it should return 301', async () => {
        const response = await request(app).get('/provinces/PEI')
        expect(response.statusCode).toBe(301)
        expect(response.headers.location).toEqual('/provinces/PE')
      })

      test('it should return 301 with the year included', async () => {
        const response = await request(app).get('/provinces/PEI/2022')
        expect(response.statusCode).toBe(301)
        expect(response.headers.location).toEqual('/provinces/PE/2022')
      })
    })

    describe('Test /provinces/:provinceId/:year responses', () => {
      test('it should return the h1, title, meta tag, and canonical link for MB in 2021', async () => {
        const response = await request(app).get('/provinces/MB/2021')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('Manitobastatutory Holidays in 2021')
        expect($('title').text()).toEqual(
          'Manitoba (MB) statutory holidays in 2021 — Canada Holidays',
        )
        expect($('meta[name="description"]').attr('content')).toMatch(
          /See all \d{1,2} statutory holidays in Manitoba, Canada in 2021./,
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/provinces/MB/2021',
        )
      })
    })

    describe('Test /federal responses', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/federal')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/federal')
        const $ = cheerio.load(response.text)
        expect($('h1 .visible').text()).toMatch(/^Canada’s next federal holiday\u00a0is/)
        expect($('title').text()).toEqual('Federal statutory holidays in Canada in 2020')
        expect($('meta[name="description"]').attr('content')).toMatch(
          /^Canada’s next federal stat holiday is/,
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/federal',
        )
      })
    })

    describe('Test /federal/:year responses', () => {
      test('it should return the h1, title, meta tag, and canonical link for federal hols in 2021', async () => {
        const response = await request(app).get('/federal/2021')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('CanadaFederal statutory holidays in 2021')
        expect($('title').text()).toEqual('Federal statutory holidays in Canada in 2021')
        expect($('meta[name="description"]').attr('content')).toMatch(
          /See all \d{1,2} federal statutory holidays in Canada in 2021./,
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/federal/2021',
        )
      })
    })

    describe('Test /*/:year responses', () => {
      const URLS = ['', '/federal', '/provinces/MB']
      URLS.map((url) => {
        describe('for a good year', () => {
          GOOD_YEARS.map((year) => {
            test(`it should return 200 for url: "${url}" and year: "${year}"`, async () => {
              const response = await request(app).get(`${url}/${year}`)
              expect(response.statusCode).toBe(200)
            })
          })

          test(`it should return 302 to the province page for url: "${url}" and current year: "${currentYear}"`, async () => {
            const response = await request(app).get(`${url}/${currentYear}`)
            expect(response.statusCode).toBe(302)
            expect(response.headers.location).toEqual(url || '/')
          })
        })

        describe('for an invalid year', () => {
          test('it should return a 400 along with the h1, title, meta tag, and canonical link', async () => {
            const response = await request(app).get(`${url}/1000`)
            const $ = cheerio.load(response.text)
            expect($('h1').text()).toEqual('400')
            expect($('p').text()).toMatch(
              `Error: No holidays for the year “1000”. Accepted years are: [${ALLOWED_YEARS.join(
                ', ',
              )}].`,
            )
            expect($('title').text()).toEqual('Error: 400 — Canada Holidays')
            expect($('meta[name="description"]').attr('content')).toEqual(
              'Error: No holidays for the year “1000”',
            )
            expect($('link[rel="canonical"]').length).toBe(0)
          })

          const INVALID_VALUES = [-1, 0, 1, 'pterodactyl']
          INVALID_VALUES.map((invalidValue) => {
            test(`it should return 400 for url: "${url}" and year: "${invalidValue}"`, async () => {
              const response = await request(app).get(`${url}/${invalidValue}`)
              expect(response.statusCode).toBe(404)
            })
          })

          const INVALID_YEARS = [2016, 2017, 2023, 2024]
          INVALID_YEARS.map((invalidYear) => {
            test(`it should return 400 for url: "${url}" and year: "${invalidYear}"`, async () => {
              const response = await request(app).get(`${url}/${invalidYear}`)
              expect(response.statusCode).toBe(400)
            })
          })
        })

        describe('with "year" query params', () => {
          const INVALID_YEARS = [-1, 0, 1, 2017, 2023, 'pterodactyl']
          INVALID_YEARS.map((invalidYear) => {
            test(`it should return 200 for url: "${url}" and a bad query param: "${invalidYear}"`, async () => {
              const response = await request(app).get(`${url}?year=${invalidYear}`)
              expect(response.statusCode).toBe(200)
              const $ = cheerio.load(response.text)
              expect($('h1').text()).toMatch(
                /^(Manitoba|Canada)’s next (?:federal\s)*statutory holiday/,
              )
            })
          })

          test(`it should return 200 for url: "${url}" and current year query param: "${currentYear}"`, async () => {
            const response = await request(app).get(`${url}?year=${currentYear}`)
            expect(response.statusCode).toBe(200)
            const $ = cheerio.load(response.text)
            expect($('h1').text()).toMatch(
              /^(Manitoba|Canada)’s next (?:federal\s)*statutory holiday/,
            )
          })

          GOOD_YEARS.map((year) => {
            test(`it should return 302 for url: "${url}" and other allowed years: "${year}"`, async () => {
              const response = await request(app).get(`${url}?year=${year}`)
              expect(response.statusCode).toBe(302)
              expect(response.headers.location).toEqual(`${url}/${year}`)
            })
          })
        })
      })
    })

    describe('Test /about response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/about')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/about')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('About')
        expect($('title').text()).toEqual('About — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Check my sources, use the API, get in touch, etc.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual('https://canada-holidays.ca/about')
      })
    })

    describe('Test /feedback response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/feedback')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/feedback')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('Feedback')
        expect($('title').text()).toEqual('Feedback — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Reprt a problem, tell me I’m cool, or let’s just chat even.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/feedback',
        )
      })
    })

    describe('Test /sources response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/sources')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/sources')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('All sources')
        expect($('title').text()).toEqual('All sources — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Aggregated sources for Canadian statutory holidays. Canada’s holidays vary by region and industry, so here they are collected in one place.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/sources',
        )
      })
    })

    describe('Test /add-holidays-to-calendar response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/add-holidays-to-calendar')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/add-holidays-to-calendar')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('Add Canada’s 2020 holidays to your calendar')
        expect($('title').text()).toEqual(
          'Add Canada’s 2020 holidays to your calendar — Canada Holidays',
        )
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Download Canadian holidays and import them to your Outlook, iCal, or Google Calendar. Add all Canadian statutory holidays or just for your region.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/add-holidays-to-calendar',
        )
      })
    })

    describe('Test /do-federal-holidays-apply-to-me response', () => {
      test('it should return 200', async () => {
        const response = await request(app).get('/do-federal-holidays-apply-to-me')
        expect(response.statusCode).toBe(200)
      })

      test('it should return the h1, title, meta tag, and canonical link', async () => {
        const response = await request(app).get('/do-federal-holidays-apply-to-me')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('Do federal holidays apply to me?')
        expect($('title').text()).toEqual('Do federal holidays apply to me? — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'How to tell if you get federal holidays or provincial holidays in Canada.',
        )
        expect($('link[rel="canonical"]').attr('href')).toEqual(
          'https://canada-holidays.ca/do-federal-holidays-apply-to-me',
        )
      })
    })

    describe('for a bad province ID', () => {
      test('it should return 404', async () => {
        const response = await request(app).get('/allosaurus')
        expect(response.statusCode).toBe(404)
      })

      const yearPaths = ['', '/2021', '/1000']
      yearPaths.map((yearPath) => {
        test(`${
          !yearPath
            ? ''
            : yearPath.startsWith('/1')
            ? `and an invalid year ("${yearPath}") `
            : `and a good year ("${yearPath}") `
        }it should return the h1, title, and meta tag`, async () => {
          const response = await request(app).get(`/provinces/pangea${yearPath}`)
          const $ = cheerio.load(response.text)
          expect($('h1').text()).toEqual('400')
          expect($('p').text()).toEqual(
            'Error: No province with id “pangea”. Accepted province IDs are: [AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT].',
          )
          expect($('title').text()).toEqual('Error: 400 — Canada Holidays')
          expect($('meta[name="description"]').attr('content')).toEqual(
            'Error: No province with id “pangea”',
          )
          expect($('link[rel="canonical"]').length).toBe(0)
        })
      })
      test('it should return the h1, title, and meta tag', async () => {
        const response = await request(app).get('/provinces/pangea')
        const $ = cheerio.load(response.text)
        expect($('h1').text()).toEqual('400')
        expect($('p').text()).toEqual(
          'Error: No province with id “pangea”. Accepted province IDs are: [AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT].',
        )
        expect($('title').text()).toEqual('Error: 400 — Canada Holidays')
        expect($('meta[name="description"]').attr('content')).toEqual(
          'Error: No province with id “pangea”',
        )
        expect($('link[rel="canonical"]').length).toBe(0)
      })
    })
  })

  describe('Test 404 responses', () => {
    test('it should return 404', async () => {
      const response = await request(app).get('/allosaurus')
      expect(response.statusCode).toBe(404)
    })

    test('it should return the h1, title, and meta tag', async () => {
      const response = await request(app).get('/allosaurus')
      const $ = cheerio.load(response.text)
      expect($('h1').text()).toEqual('404')
      expect($('title').text()).toEqual('Error: 404 — Canada Holidays')
      expect($('meta[name="description"]').attr('content')).toEqual('Oopsie daisy')
      expect($('link[rel="canonical"]').length).toBe(0)
    })
  })

  describe('Test for external source links', () => {
    const sourceURLs = [
      '/',
      '/2021',
      '/federal',
      '/federal/2021',
      '/provinces/AB',
      '/provinces/AB/2021',
    ]
    sourceURLs.map((url) => {
      test(`should return an external source for "${url}"`, async () => {
        const response = await request(app).get(url)
        const $ = cheerio.load(response.text)
        expect($('.bottom-link__container.with-source').length).toBe(1)
      })
    })
  })
})

describe('Test /province responses', () => {
  describe('Test /province GET response', () => {
    test('it should return 301', async () => {
      const response = await request(app).get('/province')
      expect(response.statusCode).toBe(301)
      expect(response.headers.location).toBe('/provinces')
    })
  })

  // should be enough
  const provinceIds = ['AB', 'BC', 'MB', 'NB', 'QC', 'YT']

  provinceIds.map((provinceId) => {
    describe(`Test /province/${provinceId} GET response`, () => {
      test('it should return 301', async () => {
        const response = await request(app).get(`/province/${provinceId}`)
        expect(response.statusCode).toBe(301)
        expect(response.headers.location).toBe(`/provinces/${provinceId}`)
      })
    })

    describe(`Test /province/${provinceId}/:year GET response`, () => {
      test('it should return 301', async () => {
        const response = await request(app).get(`/province/${provinceId}/2020`)
        expect(response.statusCode).toBe(301)
        expect(response.headers.location).toBe(`/provinces/${provinceId}/2020`)
      })
    })
  })
})
