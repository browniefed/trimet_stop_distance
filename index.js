var config = require('./config'),
    _ = require('lodash'),
    request = require('superagent');

var app = require('http').createServer(handler);

var io = require('socket.io')(app);

app.listen(process.env.PORT || 8080);



//SETUP
var API_KEY = (config && config.TRIMET_API_KEY) || process.env.TRIMET_API_KEY;
var STOPS = {};
var VEHICLES = {};
var POSITION_CACHE = {};

function handler(req, res) {
    res.writeHead(200);
    res.end('');
}

var USER_STOPS = {
};

io.on('connection', function (socket) {
    socket.on('follow_stop', function(data) {
        var stopId = data.stop,
            routeId = data.routeId,
            room = routeId + '_' + stopId;
        
        addRoomRoute(room);
        socket.join(room);

        if (POSITION_CACHE[room]) {
            socket.emit('postion_update', {
                stopId: stopId,
                routeId: routeId,
                position: POSITION_CACHE[room]
            });
        }

        socket.emit('stop_info', {
            name: STOPS[routeId].name,
            routeId: routeId,
            stopId: stopId
        });

    });
});

function updateVehicles() {
    loadVehiclePositions(function(vehicles) {
        VEHICLES = vehicles;

        var userStops = getUserStops(),
            routeVehicles,
            vehicleDirection,
            stopDistance,
            userStop;

        _.each(userStops, function(stop) {
            userStop = stop.routeId + '_' + stop.stopId;

            vehicleDirection = determineDirection(STOPS[stop.routeId].dirs, stop.stopId);
            routeVehicles = getRouteVehicles(VEHICLES, stop.routeId, vehicleDirection);
           
            stopDistance = _(routeVehicles).map(function(vehicle) {
                return getDistanceFromStop(STOPS, stop.routeId, vehicleDirection, vehicle.lastLocId, stop.stopId);
            }).filter(function(distance) {
                return distance != -1
            }).min();

            if (POSITION_CACHE[userStop] != stopDistance) {
                io.to(userStop).emit('postion_update', {
                    stopId: stop.stopId,
                    routeId: stop.routeId,
                    position: stopDistance
                });
            }

        });

        setTimeout(updateVehicles, 5000);
    });
}



function getDistanceFromStop (stops, routeId, direction, fromStop, toStop) {
    var stopList = stops[routeId].dirs[direction].stops;
    var fromStopIndex = _.findIndex(stopList, function(stop) {
        return stop.locid == fromStop;
    });

    var toStopIndex = _.findIndex(stopList, function(stop) {
        return stop.locid == toStop;
    });


    var distance = toStopIndex - fromStopIndex;

    //has the vehicle already passed our stop
    if (distance < 0) {
        return -1;
    }
    return distance;
}

function addRoomRoute(room) {
    USER_STOPS[room] = true;
}

function getUserStops() {
    var split;
    return _.map(USER_STOPS, function(v, stop) {
        split = stop.split('_');
        return {
            routeId: split[0],
            stopId: split[1]
        }
    });
}

function determineDirection(stops, stopId) {
    //direciton is wrong
    var dir0 = _.find(stops[0].stops, function(stop) {
        return stop.locid == stopId;
    });
    return !dir0 ? 1 : 0;
}

function getRouteVehicles(vehicles, routeId, dir) {
    return _.filter(vehicles, function(vehicle) {
        return vehicle.routeId == routeId && vehicle.dir == dir;
    });
}


loadRoutes(function(stops) {
    STOPS = stops;
    updateVehicles();
});




function loadRoutes(cb) {
    request.get('https://developer.trimet.org/ws/V1/routeConfig').query({
        appid: API_KEY,
        stops: true,
        tp: true,
        dir: true, 
        json:true
    }).end(function(err, res) {
       var formatted = {};

       _.each(res.body.resultSet.route, function(route) {
        formatted[route.route] = {
            name: route.desc,
            routeId: route.route,
            type: route.type,
            dirs: {
                '0': {},
                '1': {}
            }
        };

        if (route.dir[0]) {
            formatted[route.route].dirs[route.dir[0].dir] = {
                name: route.dir[0].desc,
                dir: route.dir[0].dir,
                stops: route.dir[0].stop
            }
        }

        if (route.dir[1]) {
            formatted[route.route].dirs[route.dir[1].dir] = {
                name: route.dir[1].desc,
                dir: route.dir[1].dir,
                stops: route.dir[1].stop
            }   
        }

       });

       cb(formatted);
    });
}

function loadVehiclePositions(cb) {
    request.get('https://developer.trimet.org/ws/v2/vehicles').query({
        appid: API_KEY
    }).end(function(err, res) {
        var vehicles = {};

        if (err) {
            return;
        }
        if (!(res && res.body && res.body.resultSet)) {
            return;
        }

        _.each(res.body.resultSet.vehicle, function(vehicle) {
            vehicles[vehicle.vehicleID] = {
                vehcileId: vehicle.vehicleID,
                routeId: vehicle.routeNumber,
                message: vehicle.signMessageLong,
                load: vehicle.loadPercentage || 0,
                type: vehicle.type == 'bus' ? 'B' : 'R',
                dir: vehicle.direction,
                lastLocId: vehicle.lastLocID,
                nextLocId: vehicle.nextLocID
            }
        });

        cb(vehicles);
    })
}