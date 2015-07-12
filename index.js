var restify = require('restify'),
    socketio = require('socket.io'),
    config = require('./config'),
    _ = require('lodash'),
    request = require('superagent');

var API_KEY = (config && config.TRIMET_API_KEY) || process.env.TRIMET_API_KEY;
var STOPS = {}

// var server = restify.createServer();
// var io = socketio.listen(server);

// server.listen(process.env.PORT || 8080, function() {
//   console.log('%s listening at %s', server.name, server.url);
// });

function getDistanceFromStop (stops, routeId, direction, fromStop, toStop) {
    var stopList = stops[routeId].dirs[direction].stops;
    var fromStopIndex = _.findIndex(stopList, function(stop) {
        return stop.locid == fromStop;
    });

    var toStopIndex = _.findIndex(stopList, function(stop) {
        return stop.locid == toStop;
    });

    return toStopIndex - fromStopIndex;

}


loadRoutes(function(stops) {
    STOPS = stops;
    // (getDistanceFromStop(STOPS, 100, 0, 9828, 8338));

    loadVehiclePositions(function(vehicles) {

        var route100 = _.filter(vehicles, function(vehicle) {
            return vehicle.routeId == 100 && vehicle.dir == 0;
        });

        _.each(route100, function(vehicle, vehicleId) {
            var position = getDistanceFromStop(STOPS, 100, 0, vehicle.lastLocId, 8359);

            console.log(vehicle.vehicleId + 'is ' + position + ' stops away from the end');

        })


    })
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