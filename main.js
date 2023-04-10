import jsdom from 'jsdom'
import axios from 'axios'
import fs from 'fs'

const { JSDOM } = jsdom
const allData = []

// writes date in the iso format
function format(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

const dbs = {
  'mysql': 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/MySQL.Concepts.VersionMgmt.html',
  'postgresql': 'https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-release-calendar.html',
}

for (const [db, url] of Object.entries(dbs)) {
  const html = await axios.get(url)
    .then(res => res.data)
    .catch(console.log)
  const dom = new JSDOM(html)
  
  // select all table tags
  const tables = dom.window.document.getElementsByTagName('table') 
  
  const majors = []
  const minors = []

  for (const [i, table] of Object.entries(tables)) {

    // first table is minor, second is major
    let minor = false
    if (i === '0') {
      console.log('Scraping', db, 'minor')
      minor = true
    } else {
      console.log('Scraping', db, 'major')
    }

    // select the table rows
    const rows = table.getElementsByTagName('tr')

    for (const row of rows) {
      // ignore rows which just contain a major version with no data
      if (row.childNodes.length === 3) continue
    
      const release = {}

      for (let [num, col] of row.childNodes.entries()) {
        // ignore all nodes that are not Table Data
        if (col.tagName !== 'TD') continue

        // for some reason postgresql iteration is off by one
        if (db === 'postgresql' && i === '1') {
          num++
        }

        if (num === 1) {
          const lines = col.textContent.trim().split('\n')
          if (lines.length > 1) {
            let latestMinor = lines[1].replace(/[^0-9.]/g, '')
            // if (!latestMinor) {
            //   latestMinor = null
            // }
            release.latest = latestMinor
          }
          const version = lines[0].replace(/[^0-9.]/g, '')
          release.releaseCycle = version
        } else if (num === 3) {
          // Community release date
        } else if (num === 5) {
          // RDS release date
          const date = format(new Date(col.textContent.trim()))
          // console.log('RDS release date', date)
          release.releaseDate = date
        } else if (num === 7) {
          
          // minor tables do not have a Community end of life column
          // due to different table column size a conditional is necessary
          if (minor) {
            // RDS end of standard support date
            const date = format(new Date(col.textContent.trim()))
            // console.log('RDS end of standard support date', date)
            release.eol = date
            minors.push(release)
          }

        } else if (num === 9) {
          // only major tables have this column
          // RDS end of standard support date
          const date = format(new Date(col.textContent.trim()))
          // console.log('RDS end of standard support date', date)
          release.eol = date
          majors.push(release)
        }
      }
    }
  }

  // add latest data for majors
  for (const major of majors) {
    for (const minor of minors) {
      if (major.latest === minor.releaseCycle) {
        major.latestReleaseDate = minor.releaseDate
      }
    }
  }
  
  // add latest data for minors
  for (const major of majors) {
    const majorVersion = major.releaseCycle
    for (const minor of minors) {
      const minorVersion = minor.releaseCycle
      const majorFromMinor = minorVersion.split('.').slice(0, -1).join('.')
      if (majorFromMinor === majorVersion) {
        minor.latest = major.latest
        minor.latestReleaseDate = major.latestReleaseDate
      }
    }
  }

  for (const release of minors) {
    release.type = 'minor'
  }
  for (const release of majors) {
    release.type = 'major'
    release.latest =  release.latest
  }
  const allVersions = [...minors, ...majors]
  for (const release of allVersions) {
    release.db = db
    release.id = `${db}-${release.releaseCycle}`
  }

  allData.push(...allVersions)
}

const filename = format(new Date()).slice(0, -3) + '.json'
fs.writeFileSync('data/' + filename, JSON.stringify(allData, null, 2))