var restify = require('restify'),
    socketio = require('socket.io'),
    config = require('./config'),
    _ = require('lodash'),
    request = require('superagent');

//SETUP
var API_KEY = (config && config.TRIMET_API_KEY) || process.env.TRIMET_API_KEY;
var STOPS = {};
var VEHICLES = {};


//SERVER
var server = restify.createServer();
var io = socketio.listen(server);

server.listen(process.env.PORT || 8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});

var USER_STOPS = {
    '100_8354': true
};

io.on('connection', function (socket) {
    socket.on('follow_stop', function(data) {
        var stop = data.stop,
            routeId = data.routeId,
            room = route + '_' + stop;
        
        addRoomRoute(room);
        socket.join(room);
    });
});

function updateVehicles() {
    loadVehiclePositions(function(vehicles) {
        VEHICLES = vehicles;

        var userStops = getUserStops(),
            routeVehicles,
            vehicleDirection,
            stopDistance;

        _.each(userStops, function(stop) {

            vehicleDirection = determineDirection(STOPS[stop.routeId].dirs);
            routeVehicles = getRouteVehicles(VEHICLES, stop.routeId, vehicleDirection);
           
            stopDistance = _(routeVehicles).map(function(vehicle) {
                return getDistanceFromStop(STOPS, stop.routeId, vehicleDirection, vehicle.lastLocId, stop.stopId);
            }).filter(function(distance) {
                return distance != -1
            }).min();

            io.to(stop.routeId + '_' + stop.stopId).emit('postion_update', stopDistance);
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
    var dir0 = _.find(stops[0], function(stop) {
        return stop.locid == stopId;
    });
    return dir0 === -1 ? 1 : 0;
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
            formatted[route.route].dirs[0] = {
                name: route.dir[0].desc,
                stops: route.dir[0].stop
            }
        }

        if (route.dir[1]) {
            formatted[route.route].dirs[1] = {
                name: route.dir[1].desc,
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