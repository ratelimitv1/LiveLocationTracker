const cookieParser = require("cookie-parser")
const socketIO = require("socket.io")
const config = require("./config")
const express = require("express")
const tarkine = require("tarkine")
const http = require('http')

const app = express()
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
    // On Railway the public URL is the RAILWAY_PUBLIC_DOMAIN env var
    const publicHost = process.env.RAILWAY_PUBLIC_DOMAIN
    const shareURL = publicHost ? `https://${publicHost}` : `http://localhost:${PORT}`

    global.remoteURL = shareURL

    console.log(`====================================================`)
    console.log(`  ADMIN DASHBOARD : http://localhost:${PORT}`)
    console.log(`  SHAREABLE LINK  : ${shareURL}/forecast`)
    console.log(`====================================================`)
})