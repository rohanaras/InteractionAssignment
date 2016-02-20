'use strict';

// add ability (force user?) to subset by month

var width = 950;
var height = 700;
var vis = d3.select("body").append("svg")
    .attr("width", width).attr("height", height);

var city = vis.append('g');
var trips = vis.append('g');
var stops = vis.append('g');

var currentTime = 0;
var scaleTime = 1000;

var stopCounts = {};
var userType = '';


d3.json("lib/city-limits.geojson", function(error, outline) {
    var center = d3.geo.centroid(outline);
    var scale = 270000;
    var offset = [975, 475];

    // new projection
    var projection = d3.geo.mercator().center(center)
        .scale(scale).translate(offset).rotate([0,0,0]);

    var path = d3.geo.path().projection(projection);

    city.selectAll("path").data(outline.features).enter().append("path")
        .attr("d", path)
        .style("stroke-width", "1")
        .style("fill", 'white')
        .style("stroke", "lightgrey");

    loadDrawStops(projection);
    loadTrips(projection);
});

// loads and draws stop data
function loadDrawStops(projection) {
    d3.csv('lib/2015_station_data.csv', function(error, stations) {
        for (var idx = 0; idx < stations.length; idx++) {
            stopCounts[stations[idx].name] = {
                start: { member: 0, onetime: 0},
                end: { member: 0, onetime: 0}
            };
            drawStops(projection, stops.append('g'), stations[idx])
        }
    })
}

function drawStops(projection, layer, station) {

    var stop = layer.selectAll('circle')
        .data([station]).enter()
        .append('circle')
        .attr("cx", function (d) { return projection([d.long,])[0] })
        .attr("cy", function (d) { return projection([,d.lat])[1] })
        .attr("r", 4)
        .style("fill", 'grey')
        .on("mouseover", function(d) {
            stop.attr('r', 5);

            var startcount;
            var endcount;
            if(userType === "Member ") {
                startcount = stopCounts[d.name]['start']['member'];
                endcount = stopCounts[d.name]['end']['member'];
            } else if(userType === "One Time User ") {
                startcount = stopCounts[d.name]['start']['onetime'];
                endcount = stopCounts[d.name]['end']['onetime'];
            } else {
                startcount = stopCounts[d.name]['start']['onetime'] +
                    stopCounts[d.name]['start']['member'];
                endcount = stopCounts[d.name]['end']['onetime'] +
                    stopCounts[d.name]['end']['member'];
            }

            d3.select('#stopinfo')
                .append('h4')
                .text(d.name);
            d3.select('#stopinfo')
                .append('p')
                .text("Number of bike docks: " + d.dockcount);
            d3.select('#stopinfo')
                .append('p')
                .text(userType + 'Departures: ' + startcount);
            d3.select('#stopinfo')
                .append('p')
                .text(userType + 'Arrivals: ' + endcount)
        })
        .on("mouseout", function(d) {
            d3.select('#stopinfo').html("");
            stop.attr('r', 4);
        });

    setInterval(function() {
        stop.style("fill", function(d) {
            var startcount = stopCounts[d.name]['start']['onetime'] +
                stopCounts[d.name]['start']['member'];
            var endcount = stopCounts[d.name]['end']['onetime'] +
                stopCounts[d.name]['end']['member'];

            if (startcount == 0 && endcount == 0) {
                return 'grey'
            } else if (startcount > endcount) {
                return "#abd9e9"
            } else if (endcount > startcount) {
                return "#fdae61"
            }
            return "#D8C19E"
        })
    }, 100)
}

// loads trip data, starts clock
function loadTrips(projection) {
    d3.csv("lib/2015_trip_data.csv", function(error, tripData) {
        var links = [];
        for(var i = 0; i < tripData.length; i++){
            links.push({
                startstop: tripData[i].from_station_name,
                endstop: tripData[i].to_station_name,
                coordinates: [
                    { lon: tripData[i].startlon, lat: tripData[i].startlat},
                    { lon: tripData[i].endlon, lat: tripData[i].endlat }
                ],
                timestamps: {start: new Date(tripData[i].starttime), end: new Date(tripData[i].stoptime)},
                demographics: {
                    member: tripData[i].usertype === 'Annual Member',
                    gender: tripData[i].gender,
                    birthYear: tripData[i].birthyear
                }
            });
        }

        links = links.slice(0, 1000);

        var earliest = links[0].timestamps.start; //data is sorted
        var last = links[links.length - 1].timestamps.end;



        for (var idx = 0; idx < links.length; idx++) {
            var wait = (links[idx].timestamps.start - earliest) / scaleTime;
            var duration = (links[idx].timestamps.end - links[idx].timestamps.start) / scaleTime;
            drawTrips(projection, trips.append('g'),links[idx], wait, duration);
        }
        clock(earliest, last);
    });
}

// draws trip paths
function drawTrips(projection, layer, link, wait, duration) {
    var line = d3.svg.line()
        .x(function (d) {
            return projection([d.lon,])[0]
        })
        .y(function (d) {
            return projection([, d.lat])[1]
        })
        .interpolate("linear");

    var tripPath = layer.selectAll("path")
        .data([link]).enter().append("path")
        .attr("d", function(d) { return line(d.coordinates) })
        .attr("stroke", "steelblue")
        .attr("stroke-width", "1")
        .attr("fill", "none")
        .attr("class", function(d) { return d.timestamps });

    var tripLength = tripPath.node().getTotalLength();

    //fade in
    tripPath.attr("stroke-dasharray", tripLength + " " + tripLength)
        .attr("stroke-dashoffset", tripLength)
        .attr('class', 'trail')
        .transition()
        .delay(wait)
        .duration(duration)
        .ease("linear")
        .attr("stroke-dashoffset", 0)

        //update stop counts
        .each("start", function(d) {
            if(d.demographics.member) {
                stopCounts[d.startstop]['start']['member']++
            } else {
                stopCounts[d.startstop]['start']['onetime']++
            }
        })
        .each("end", function(d) {
            if(d.demographics.member) {
                stopCounts[d.endstop]['end']['member']++
            } else {
                stopCounts[d.endstop]['end']['onetime']++
            }
        })

        // change color
        .transition()
        .attr("stroke", 'lightblue')
        // fade away
        .transition()
        .duration(10)
        .style('opacity', 0);
}

// animates the clock
function clock(start, end) {
    var date = start;
    setInterval(function() {
        if (date <= end) {
            d3.select('#time').text(date);
            date.setTime(date.getTime() + 100 * scaleTime);
            currentTime = date;
        }
    }, 100);
}

d3.select('#allVisibility').on('click', function() {
    if (d3.select(this).text() === 'Show Trails up to Now') {
        //button configuration
        d3.select(this).text('Hide Trails');
        d3.select('#memberVisibility').style('visibility', 'visible');
        d3.select('#onetimeVisibility').style('visibility', 'visible');

        //trail manipulation
        d3.selectAll('.trail').style('opacity', 100);

    } else {
        //button configuration
        d3.select(this).text('Show Trails up to Now');
        d3.select('#memberVisibility')
            .style('visibility', 'hidden').text('Hide Member Trips');
        d3.select('#onetimeVisibility')
            .style('visibility', 'hidden').text('Hide One Time Trips');

        //stopinfo reset
        userType = '';

        //trail manipulation
        d3.selectAll('.trail').filter(function(d) {
            return d.timestamps.end < currentTime
        }).style('opacity', 0);
    }
});

d3.select("#memberVisibility").on('click', function() {
    if (d3.select(this).text() === 'Hide Member Trips') {
        d3.select(this).text('Show Member Trips');

        //stopinfo stuff
        if (userType === 'Member ') {
            userType = '';
        } else {
            userType = "One Time User "
        }

        d3.selectAll('.trail').filter(function(d) {
            return d.timestamps.end < currentTime && d.demographics.member
        }).style('opacity', 0);
    } else {
        d3.select(this).text('Hide Member Trips');

        //stopinfo stuff
        if (userType === 'One Time User ') {
            userType = '';
        } else {
            userType = "Member "
        }

        d3.selectAll('.trail').filter(function(d) {
            return d.timestamps.end < currentTime && d.demographics.member
        }).style('opacity', 100);
    }
});

d3.select('#onetimeVisibility').on('click', function() {
    if (d3.select(this).text() === 'Hide One Time Trips') {
        d3.select(this).text('Show One Time Trips');

        //stopinfo stuff
        if (userType === 'One Time User ') {
            userType = '';
        } else {
            userType = "Member "
        }

        //trail manipulation
        d3.selectAll('.trail').filter(function(d) {
            return d.timestamps.end < currentTime && !d.demographics.member
        }).style('opacity', 0);
    } else {
        d3.select(this).text('Hide One Time Trips');

        //stopinfo stuff
        if (userType === 'Member ') {
            userType = '';
        } else {
            userType = 'One Time User '
        }

        //trail manipulation
        d3.selectAll('.trail').filter(function(d) {
            return d.timestamps.end < currentTime && !d.demographics.member
        }).style('opacity', 100);
    }
});
