const cookieParser = require("cookie-parser")
const socketIO = require("socket.io")
const config = require("./config")
const express = require("express")
const tarkine = require("tarkine")
const http = require('http')

const app = express()
app.set("trust proxy", true) // Required for Railway — gets real client IP from X-Forwarded-For
const server = http.createServer(app)
const io = new socketIO.Server(server)
const PORT = process.env.PORT || config.port

global.IO = io

app.set("view engine", "html")
app.engine("html", tarkine.renderFile)
app.use(cookieParser())
app.use(express.urlencoded({ extended: false }))
app.use(express.static(__dirname + "/public"))
app.use(express.json())

app.use("/", require("./router"))

server.listen(PORT, "0.0.0.0", () => {
    const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL
    const shareURL = publicHost
        ? (publicHost.startsWith("http") ? publicHost : `https://${publicHost}`)
        : `http://localhost:${PORT}`

    global.remoteURL = shareURL

    console.log(`====================================================`)
    console.log(`  ADMIN DASHBOARD : http://localhost:${PORT}`)
    console.log(`  SHAREABLE LINK  : ${shareURL}/forecast`)
    console.log(`  PUBLIC DOMAIN   : ${process.env.RAILWAY_PUBLIC_DOMAIN}`)
    console.log(`====================================================`)
})