const http = require("http");
const https = require('https');
const server = http.createServer();
const url = require('url');
const fs = require('fs');

/*  ./auth/credentials.json contains:
 *  Private Key for Auth2.0 with Eventbrite
 *  API Key for OpenWeather
 * 
 * ./cache/{event_id}.json contains:
 *  Expiration Time
 *  dynamicHTML for event
 */
const credentials = require('./auth/credentials.json');

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const staticHTML = `<!DOCTYPE html>
    <html>
        <head>
            <meta charset="utf-8">
		    <meta name="viewport" content="width=device-width, initial-scale=1, shink-to-fit=no">
            <title>Mashup final project</title>
            <link href="https://fonts.googleapis.com/css2?family=Lato&display=swap" rel="stylesheet">
            <link rel = "stylesheet" type = "text/css" href = "./style.css">
        </head>
        <body>
        <div class="container">
            <div class="primary event">
                <form action="event" method="get">
                    <label for="id">Eventbrite Event ID</label>
                    <input type="text" name="id">
                    <input type="submit" value="Submit">
                </form>`;
let dynamicHTML = "";

//make time look right
function formatTime(unix){
    let date = new Date(unix * 1000);
    let ending = "AM";
    let hours = date.getHours();
    if(hours > 12) {
        ending = "PM";
        hours -= 12;
    }
    else if (hours === 0) {
        hours = 12;
    }
    let minutes =  date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
    return `${hours}:${minutes}&nbsp;${ending}`;
}

//cache event, good for the next hour
function cacheEvent(event_id){
    let time = new Date();
    let toCache = { 
        "expiration": time.setHours(time.getHours() + 1),
        dynamicHTML
    };
    fs.writeFile(`./cache/${event_id}.json`, JSON.stringify(toCache), (err, result) => {
		if(err) console.log(`ERROR: ${err} ${result}`);
	});
}
    
//query eventbrite w/ event id
function queryEventbrite(id, res){
    let event_req = https.request(`https://www.eventbriteapi.com/v3/events/${id}/`, 
        {
            "method": "GET",
            "headers": {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${credentials.eventbrite}`
            }
        }, 
        (event_res) => {
            event_res.setEncoding("utf8");
            let body = "";
	        event_res.on("data", (chunk) => {body += chunk;});
	        event_res.on("end", () => {
                body = JSON.parse(body);
                if (typeof body.venue_id === "undefined"){
                    dynamicHTML = "This event doesnt exist or is hosted online.";
                    res.write(staticHTML + dynamicHTML);
                    res.end();
                }
                else {
                    let venue_id = body.venue_id;
                    console.log(`Venue ID: ${venue_id}`);
                    dynamicHTML += `
                        <h1>${body.name.html}</h1>
                        <h2>ID: ${body.id}</h2>
                        <div class="secondary">
                            <h3>Description</h3>
                            <p>${body.description.html}</p>
                        </div>
                    </div>`;
                    queryVenue(id, venue_id, res); //when query for event is finished, query for venue to get location
                }
	        });
        }
    );
    event_req.on('error', (err) => {
        console.error(err);
    });
    console.log("Requesting event from eventbrite");
    event_req.end();
}

//query eventbrite for location details
function queryVenue(event_id, venue_id, res){
    let venue_req = https.request(`https://www.eventbriteapi.com/v3/venues/${venue_id}/`, 
        {
            "method": "GET",
            "headers": {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${credentials.eventbrite}`
            }
        }, 
        (venue_res) => {
            venue_res.setEncoding("utf8");
            let body = "";
	        venue_res.on("data", (chunk) => {body += chunk;});
	        venue_res.on("end", () => {
                body = JSON.parse(body);
                if (venue_id) queryWeather(event_id, venue_id, body.latitude , body.longitude, res); //get weather at location
                else {
                    res.write(staticHTML + dynamicHTML + "No weather found, event is online or venue not disclosed.");
                    res.end();
                }
	        });
        }
    );
    venue_req.on('error', (err) => {
        console.error(err);
    });
    console.log("Requesting venue from eventbrite");
    venue_req.end();
}

//query weather app with location
function queryWeather(event_id, venue_id, lat, lon, res) {
    let weather_req = https.get(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=imperial&appid=${credentials.openweather}`, 
        (weather_res) => {
            weather_res.setEncoding("utf8");
            let body = "";
	        weather_res.on("data", (chunk) => {body += chunk;});
	        weather_res.on("end", () => {
                body = JSON.parse(body);

                //todays weather
                dynamicHTML += `<div class="primary curr-weather">
                    <h3>Current&nbsp;Weather</h3>
                    <p>${Math.round(body.current.temp)}&deg;F</p>
                    <p>Sunrise&nbsp;Time:&nbsp;${formatTime(body.current.sunrise)}</p>
                    <p>Sunset&nbsp;Time:&nbsp;${formatTime(body.current.sunset)}</p>`;
                body.current.weather.forEach((element) => {
                    dynamicHTML += `<div>
                        <img src="http://openweathermap.org/img/wn/${element.icon}@2x.png">
                        <p><strong>${element.main}</strong></p>
                        <p>${element.description}</p>
                    </div>`;
                });

                //next 5 hrs weather
                dynamicHTML += `</div></div><div class="primary container"><div class="secondary" id="hourly"><h3>The Next 5 Hours</h3><div class="container">`;
                for (let i = 0; i < 5; i++) {
                    let hour = body.hourly[i];
                    dynamicHTML += `<div class="tertiary"><strong>${formatTime(hour.dt)}</strong>
                            <p>${Math.round(hour.temp)}&deg;F</p>`;
                    hour.weather.forEach((element) => {
                        dynamicHTML += `<div class="element">
                            <img src="http://openweathermap.org/img/wn/${element.icon}@2x.png">
                            <p>${element.main}</p>
                            <p>${element.description}</p>
                        </div>`;
                    });
                    dynamicHTML += `</div>`;
                };

                //weather for the rest of the week
                dynamicHTML += `</div></div><div class="secondary" id="daily"><h3>This Week</h3><div class="container">`;

                body.daily.forEach((element, index) => {
                    dynamicHTML += `<div class="tertiary">`;
                    if (index !== 0) {
                        let date = new Date(element.dt * 1000);
                        let day = date.getDay();
                        dynamicHTML += `<strong>${days[day]}</strong>`;
                    }
                    else {
                        dynamicHTML += `<strong>Today</strong>`;
                    }
                    dynamicHTML += `
                        <p>Min: ${Math.round(element.temp.min)}&deg;F</p>
                        <p>Max: ${Math.round(element.temp.max)}&deg;F</p>`;
                    element.weather.forEach((element)=> {
                        dynamicHTML+= `<div class="element">
                                <img src="http://openweathermap.org/img/wn/${element.icon}@2x.png">
                                <p>${element.main}</p>
                                <p>${element.description}</p>
                            </div>`;
                    });
                    dynamicHTML += `</div>`;
                    
                });

                dynamicHTML += `</div></div></div></body></html>`;

                cacheEvent(event_id, venue_id, lat, lon);

                res.write(staticHTML + dynamicHTML);
                res.end();
	        });
        }
    );
    weather_req.on('error', (err) => {
        console.error(err);
    });
    console.log("Requesting weather from OpenWeather");
    weather_req.end();
}

server.on("request", (req, res) => { 
    console.log(req.url);
    if (req.url === "/"){
		res.writeHead(200, {'Content-Type': 'text/html'});
        res.write(`${staticHTML}</div></div></body></html>`);
        res.end();
    }

    else if (req.url === "favicon.ico"){
        const icon = fs.createReadStream(`assets/weather.ico`);
		res.writeHead(200, {"Content-Type": "image/x-icon"});
		icon.pipe(res);
    }

    else if (req.url === "/style.css"){
        const stylesheet = fs.createReadStream(`assets/style.css`);
		res.writeHead(200, {"Content-Type": "text/css"});
		stylesheet.pipe(res);
    }

    else if (req.url.startsWith("/event")){
        dynamicHTML = "";
        res.writeHead(200, {'Content-Type': 'text/html'});
        let id = url.parse(req.url, true).query.id;
        console.log(`Event ID: ${id}`);
        
        let cacheUnusable = true;
        let cachePath = `./cache/${id}.json`;

        if(fs.existsSync(cachePath)){
            let cachedEvent = require(cachePath);
            if(new Date(cachedEvent.expiration) > Date.now()){
                console.log("cached page found");
                
                //display cached page
                res.write(staticHTML + cachedEvent.dynamicHTML);
                res.end();

                cacheUnusable = false;
            }
        }

        if(cacheUnusable) queryEventbrite(id, res);
    }
    
    else {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.write("404 Not found");
        res.end();
    }
});

server.on("listening", () => { console.log(`Now listening on port 3000`); });
server.listen(process.env.PORT || 8080); //listen on port 8080