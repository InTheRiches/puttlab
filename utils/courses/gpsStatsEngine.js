import {BREAK_MAP, FEET_PER_METER, METERS_PER_DEGREE, STAT_BREAKS, STAT_SLOPES} from "../../constants/Constants";
import {categorizeDistance} from "../stats/statsHelpers";
import {calculateBaselineStrokesGained} from "../StrokesGainedUtils";

/**
 * Performs bilinear interpolation on a regularly spaced, but potentially non-square, grid of points.
 * @param {number} x The x-coordinate of the point to interpolate.
 * @param {number} y The y-coordinate of the point to interpolate.
 * @param {Array<{x: number, y: number, z: number}>} grid The grid data, sorted first by y, then by x.
 * @returns {number} The interpolated z-value (elevation).
 */
export function getElevationBilinear(x, y, grid) {
    // --- 1. Basic validation and grid dimension calculation ---
    if (!grid || grid.length < 4) {
        // Need at least a 2x2 grid to interpolate.
        return grid?.[0]?.value ?? 0;
    }

    const firstY = grid[0].location.y;
    const width = grid.findIndex(p => p.location.y !== firstY);
    // If all points are on the same line, findIndex returns -1.

    if (width === -1) return grid[0].value;

    const height = grid.length / width;
    if (!Number.isInteger(height)) {
        // Grid is not rectangular, cannot interpolate reliably.
        console.error("Grid is not rectangular.");
        return grid[0].value;
    }

    // --- 2. Calculate grid spacing and origin ---
    const xOrigin = grid[0].location.x;
    const yOrigin = grid[0].location.y;
    const xSpacing = grid[1].location.x - xOrigin;
    const ySpacing = grid[width].location.y - yOrigin;

    // --- 3. Calculate fractional position in the grid (without clamping yet) ---
    const col = (x - xOrigin) / xSpacing;
    const row = (y - yOrigin) / ySpacing;

    // --- 4. Get integer indices of the top-left corner of the cell ---
    let i = Math.floor(col);
    let j = Math.floor(row);

    // --- 5. Get the fractional parts (interpolation weights) ---
    const u = col - i; // x-component (horizontal weight)
    const v = row - j; // y-component (vertical weight)

    // --- 6. Clamp indices to be within the valid grid bounds ---
    // This ensures we can always fetch four points.
    i = Math.max(0, Math.min(i, width - 2));
    j = Math.max(0, Math.min(j, height - 2));

    // --- 7. Fetch the four surrounding points (the 2x2 cell) ---
    //  (i, j)   ---   (i+1, j)
    //    |              |
    // (i, j+1)  ---  (i+1, j+1)
    const z00 = grid[j * width + i].value;       // Top-left
    const z10 = grid[j * width + (i + 1)].value;     // Top-right
    const z01 = grid[(j + 1) * width + i].value;   // Bottom-left
    const z11 = grid[(j + 1) * width + (i + 1)].value; // Bottom-right

    // --- 8. Perform the interpolation ---
    // Interpolate horizontally along the top edge of the cell
    const zTop = z00 * (1 - u) + z10 * u;

    // Interpolate horizontally along the bottom edge of the cell
    const zBottom = z01 * (1 - u) + z11 * u;

    // Interpolate vertically between the two horizontal results
    return zTop * (1 - v) + zBottom * v;
}

/**
 * Correctly computes the slope vector (gradient) at a point using meters.
 * @param {number} x - Longitude of the point.
 * @param {number} y - Latitude of the point.
 * @param {Array} grid - The elevation grid data.
 * @param {number} h_meters - The step distance for finite difference, in meters.
 * @returns {{dx: number, dy: number}} The gradient as a unitless slope (m/m).
 */
export function getPuttGradient(x, y, grid, h_meters = 1) { // Use a small step, e.g., 1 cm
    const lat_rad = y * (Math.PI / 180);

    // Convert step from meters to degrees for both longitude and latitude
    const h_lat = h_meters / METERS_PER_DEGREE;
    const h_lon = h_meters / (METERS_PER_DEGREE * Math.cos(lat_rad));

    // elevations at points +/- h meters away
    const zx1 = getElevationBilinear(x + h_lon, y, grid);
    const zx2 = getElevationBilinear(x - h_lon, y, grid);
    const zy1 = getElevationBilinear(x, y + h_lat, grid);
    const zy2 = getElevationBilinear(x, y - h_lat, grid);

    // Calculate slope (dz / dx) in meters/meters
    const dx = (zx1 - zx2) / (2 * h_meters);
    const dy = (zy1 - zy2) / (2 * h_meters);

    return { dx, dy };
}

// --- STATS ENGINE HELPER FUNCTIONS ---

/**
 * Calculates the planar distance in meters and feet between two GPS coordinates.
 * This is accurate for short distances like those on a golf green.
 * @param {{latitude: number, longitude: number}} loc1 - The first location.
 * @param {{latitude: number, longitude: number}} loc2 - The second location.
 * @returns {{meters: number, feet: number}} The distance.
 */
export function getDistance(loc1, loc2) {
    if (!loc1 || !loc2) return { meters: 0, feet: 0 };
    const dx_deg = loc2.longitude - loc1.longitude;
    const dy_deg = loc2.latitude - loc1.latitude;
    const lat_rad_mid = ((loc1.latitude + loc2.latitude) / 2) * (Math.PI / 180);

    const dx_m = dx_deg * METERS_PER_DEGREE * Math.cos(lat_rad_mid);
    const dy_m = dy_deg * METERS_PER_DEGREE;

    const meters = Math.sqrt(dx_m ** 2 + dy_m ** 2);
    const feet = meters * FEET_PER_METER;
    return { meters, feet };
}

/**
 * Gets the average number of putts for a PGA Tour player from a given distance.
 * This is used for calculating Strokes Gained.
 * @param {number} distanceFeet - The distance of the putt in feet.
 * @returns {number} The expected number of putts.
 */
export function getExpectedPutts(distanceFeet) {
    // Data points from PGA tour stats
    const pgaData = [
        { dist: 0, putts: 1.0 },
        { dist: 3, putts: 1.001 },
        { dist: 5, putts: 1.25 },
        { dist: 8, putts: 1.5 },
        { dist: 15, putts: 1.8 },
        { dist: 25, putts: 1.99 },
        { dist: 40, putts: 2.15 },
        { dist: 60, putts: 2.3 },
        { dist: 100, putts: 2.5 },
    ];

    if (distanceFeet <= pgaData[0].dist) return pgaData[0].putts;
    if (distanceFeet >= pgaData[pgaData.length - 1].dist) return pgaData[pgaData.length - 1].putts;

    for (let i = 0; i < pgaData.length - 1; i++) {
        if (distanceFeet >= pgaData[i].dist && distanceFeet <= pgaData[i + 1].dist) {
            const d1 = pgaData[i].dist;
            const p1 = pgaData[i].putts;
            const d2 = pgaData[i + 1].dist;
            const p2 = pgaData[i + 1].putts;

            // Linear interpolation
            return p1 + ((distanceFeet - d1) / (d2 - d1)) * (p2 - p1);
        }
    }
    return 2.5; // Fallback
}


// --- MAIN STATS ENGINE ---

/**
 * Analyzes a round of putting data to generate detailed statistics.
 * @param {Array<{pinLocation: {latitude, longitude}, putts: Array<{latitude, longitude}>}>} roundData - An array of hole data.
 * @param greens
 * @param units
 * @returns {object} A comprehensive object of putting statistics.
 */
export function calculateGPSRoundStats(roundData, greens, units) {
    const detailedPutts = [];
    const stats = {
        totalPutts: 0,
        holesPlayed: 0,
        totalMisses: 0,
        totalMadePutts: 0,
        madePercent: 0,
        strokesGained: 0,
        leftRightBiasInches: 0, // Negative: Left miss, Positive: Right miss
        shortPastBiasInches: 0, // Negative: Short, Positive: Long
        puttCounts: { onePutts: 0, twoPutts: 0, threePlusPutts: 0 },
        totalDistanceFeet: 0,
        percentHigh: 0,
        percentShort: 0,
        missDistribution: {
            farLeft: 0, // > 18 inches left
            left: 0,    // 3-18 inches left
            center: 0,  // < 3 inches left/right
            right: 0,   // 3-18 inches right
            farRight: 0, // > 18 inches right
            long: 0,
            short: 0,
        },
        shotPlacementData: {},
    };

    const approachCounts = {
        green: 0,
        right: 0,
        left: 0,
        short: 0,
        long: 0
    };
    const teeShotCounts = {
        green: 0, // technically it is the fairway, but we will use green for simplicity
        right: 0,
        left: 0,
        short: 0,
        long: 0
    };

    let totalMissDistanceSum = 0;
    let highSideMisses = 0;
    let shortMisses = 0;
    let leftRightMissSumInches = 0;
    let shortPastMissSumInches = 0;

    roundData.forEach((hole, index) => {
        const acc = hole.approachAccuracy;
        if (hole.par > 3 && acc && approachCounts.hasOwnProperty(acc)) {
            approachCounts[acc]++;
        }

        const acc2 = hole.fairwayAccuracy;
        if (acc2 && teeShotCounts.hasOwnProperty(acc2)) {
            teeShotCounts[acc2]++;
        }

        if (!hole.puttData) {
            console.warn("No putt data for hole", hole);
            return;
        }

        const { pinLocation, taps: putts } = hole.puttData;
        if (!putts || putts.length === 0) return;

        detailedPutts.push({
            ...hole,
            totalPutts: putts.length
        });

        let lidarGrid = null;

        for (const g of greens) {
            if (g.hole === (index+1).toString()) {
                lidarGrid = g.lidar;
                break;
            }
        }

        if (!lidarGrid) {
            console.warn("No lidar grid found for hole", hole);
            return;
        }

        stats.holesPlayed++;

        // --- Per-Hole Stats ---
        stats.totalPutts += putts.length;
        stats.totalMadePutts++;

        const firstPuttDist = units === 0 ? getDistance(putts[0], pinLocation).feet : getDistance(putts[0], pinLocation).meters;
        const expectedPutts = getExpectedPutts(firstPuttDist);
        stats.strokesGained += (expectedPutts - putts.length);

        if (putts.length === 1) {
            stats.puttCounts.onePutts++;
        } else if (putts.length === 2) {
            stats.puttCounts.twoPutts++;
        } else {
            stats.puttCounts.threePlusPutts++;
        }

        // --- Loop through each putt on the hole ---
        for (let i = 0; i < putts.length; i++) {
            const isMadePutt = (i === putts.length - 1);
            const startLoc = putts[i];
            const endLoc = isMadePutt ? pinLocation : putts[i + 1];

            const puttDistance = getDistance(startLoc, endLoc);
            stats.totalDistanceFeet += units === 0 ? puttDistance.feet : puttDistance.meters;

            if (!isMadePutt) {
                stats.totalMisses++;

                const missDistance = getDistance(endLoc, pinLocation);
                totalMissDistanceSum += units === 0 ? missDistance.feet : missDistance.meters;

                // --- Calculate Miss Biases (Left/Right, Short/Long) ---
                // We create a coordinate system where the x-axis is the line from the ball to the hole.

                // 1. Vector from ball's start to the pin (the intended line)
                const lineVec = {
                    x: pinLocation.longitude - startLoc.longitude,
                    y: pinLocation.latitude - startLoc.latitude,
                };

                // 2. Vector from where the putt ended to the pin
                const missVec = {
                    x: endLoc.longitude - pinLocation.longitude,
                    y: endLoc.latitude - pinLocation.latitude,
                };

                // 3. Angle of the intended line
                const angle = Math.atan2(lineVec.y, lineVec.x);

                // 4. Rotate the miss vector to align with the intended line
                const rotatedX = missVec.x * Math.cos(-angle) - missVec.y * Math.sin(-angle);
                const rotatedY = missVec.x * Math.sin(-angle) + missVec.y * Math.cos(-angle);

                // Convert degrees to meters/inches
                const latRad = startLoc.latitude * (Math.PI / 180);
                const metersPerLonDegree = METERS_PER_DEGREE * Math.cos(latRad);
                const longMissMeters = rotatedX * metersPerLonDegree; // In this rotated system, X is long/short
                const latMissMeters = rotatedY * METERS_PER_DEGREE;  // Y is left/right

                const longMissInches = longMissMeters * (units === 0 ? 39.3701 : 1);
                const latMissInches = latMissMeters * (units === 0 ? 39.3701 : 1); // Convert to inches if using feet

                shortPastMissSumInches += longMissInches;
                leftRightMissSumInches += latMissInches;

                // Categorize short/long
                if (Math.abs(longMissInches) > Math.abs(latMissInches)) {
                    if (longMissInches < 0) {
                        stats.missDistribution.short++;
                        shortMisses++;
                    } else {
                        stats.missDistribution.long++;
                    }
                } else {
                    // Categorize left/right (positive Y is a left miss)
                    if (latMissInches > (units === 0 ? 18 : 0.5)) stats.missDistribution.farLeft++;
                    else if (latMissInches > (units === 0 ? 3 : 0.1)) stats.missDistribution.left++;
                    else if (latMissInches < (units === 0 ? -18 : -0.5)) stats.missDistribution.farRight++;
                    else if (latMissInches < (units === 0 ? -3 : -0.1)) stats.missDistribution.right++;
                    else stats.missDistribution.center++;
                }

                // --- High Side Percentage ---
                const mid = {
                    x: (startLoc.longitude + pinLocation.longitude) / 2,
                    y: (startLoc.latitude + pinLocation.latitude) / 2
                };
                const grad = getPuttGradient(mid.x, mid.y, lidarGrid);
                const latDiffMeters = lineVec.y * 111320;
                const lonDiffMeters = lineVec.x * 111320 * Math.cos(startLoc.latitude * Math.PI / 180);
                const sideSlope = grad.dx * -latDiffMeters + grad.dy * lonDiffMeters;

                const breaksLeft = sideSlope > 0;
                const missedRight = latMissInches < 0;

                if ((breaksLeft && missedRight) || (!breaksLeft && !missedRight)) {
                    highSideMisses++;
                }
            }
        }
    });

    // --- Final Calculations ---
    if (stats.totalPutts > 0) {
        stats.madePercent = (stats.totalMadePutts / stats.totalPutts);
    }
    if (stats.totalMisses > 0) {
        stats.avgMissFeet = totalMissDistanceSum / stats.totalMisses;
        stats.percentHigh = (highSideMisses / stats.totalMisses);
        stats.percentShort = (shortMisses / stats.totalMisses);
        stats.leftRightBiasInches = leftRightMissSumInches / stats.totalMisses;
        stats.shortPastBiasInches = shortPastMissSumInches / stats.totalMisses;
    }

    // Format numbers for cleaner output
    for (const key in stats) {
        if (typeof stats[key] === 'number') {
            stats[key] = parseFloat(stats[key].toFixed(2));
        }
    }
    for (const key in stats.puttCounts) {
        if (typeof stats.puttCounts[key] === 'number') {
            stats.puttCounts[key] = Math.round(stats.puttCounts[key]);
        }
    }
    for (const key in stats.missDistribution) {
        if (typeof stats.missDistribution[key] === 'number') {
            stats.missDistribution[key] = Math.round(stats.missDistribution[key]);
        }
    }

    // we only do this for approach shots as if there are par 3s it wont have the same number of data as teeShots
    const approachTotal = approachCounts.green + approachCounts.right + approachCounts.left + approachCounts.short + approachCounts.long;
    const approachPct = (count) => ((count / approachTotal) * 100).toFixed(1);
    const shotPct = (count) => ((count / stats.holes) * 100).toFixed(1);

    stats.shotPlacementData = {
        approach: {
            accuracy: approachPct(approachCounts.green),
            missBias: approachCounts.right > approachCounts.left ? "Right" : approachCounts.left > approachCounts.right ? "Left" : "Balanced",
            distanceBias: approachCounts.short > approachCounts.long ? "Short" : approachCounts.long > approachCounts.short ? "Long" : "Balanced",
            placement: {
                green: approachPct(approachCounts.green),
                right: approachPct(approachCounts.right),
                left: approachPct(approachCounts.left),
                short: approachPct(approachCounts.short),
                long: approachPct(approachCounts.long)
            }
        },
        teeShot: {
            accuracy: shotPct(teeShotCounts.green),
            missBias: teeShotCounts.right > teeShotCounts.left ? "Right" : teeShotCounts.left > teeShotCounts.right ? "Left" : "Balanced",
            distanceBias: teeShotCounts.short > teeShotCounts.long ? "Short" : teeShotCounts.long > teeShotCounts.short ? "Long" : "Balanced",
            placement: {
                fairway: shotPct(teeShotCounts.green),
                right: shotPct(teeShotCounts.right),
                left: shotPct(teeShotCounts.left),
                short: shotPct(teeShotCounts.short),
                long: shotPct(teeShotCounts.long)
            }
        }
    }

    return {...stats, detailedPutts};
}

/**
 * Analyzes a round of putting data to generate detailed statistics.
 * @param {Array<{pinLocation: {latitude, longitude}, putts: Array<{latitude, longitude}>}>} roundData - An array of hole data.
 * @param greens
 * @param units
 * @returns {object} A comprehensive object of putting statistics.
 */
export function calculateGPSPuttsOnlyStats(roundData, greens, units) {
    const stats = {
        totalPutts: 0,
        holesPlayed: 0,
        totalMisses: 0,
        totalMadePutts: 0,
        madePercent: 0,
        strokesGained: 0,
        leftRightBiasInches: 0, // Negative: Left miss, Positive: Right miss
        shortPastBiasInches: 0, // Negative: Short, Positive: Long
        puttCounts: { onePutts: 0, twoPutts: 0, threePlusPutts: 0 },
        totalDistanceFeet: 0,
        percentHigh: 0,
        percentShort: 0,
        missDistribution: {
            farLeft: 0, // > 18 inches left
            left: 0,    // 3-18 inches left
            center: 0,  // < 3 inches left/right
            right: 0,   // 3-18 inches right
            farRight: 0, // > 18 inches right
            long: 0,
            short: 0,
        },
    };

    const detailedPutts = [];

    let totalMissDistanceSum = 0;
    let highSideMisses = 0;
    let shortMisses = 0;
    let leftRightMissSumInches = 0;
    let shortPastMissSumInches = 0;

    roundData.forEach((hole, index) => {
        if (!hole) {
            console.warn("No putt data for hole", hole);
            return;
        }

        const { pinLocation, taps: putts } = hole;
        if (!putts || putts.length === 0) return;

        detailedPutts.push({
            ...hole,
            totalPutts: putts.length
        });

        let lidarGrid = null;

        for (const g of greens) {
            if (g.hole === (index+1).toString()) {
                lidarGrid = g.lidar;
                break;
            }
        }

        if (!lidarGrid) {
            console.warn("No lidar grid found for hole", hole);
            return;
        }

        stats.holesPlayed++;

        // --- Per-Hole Stats ---
        stats.totalPutts += putts.length;
        stats.totalMadePutts++;

        const puttExpectedStrokes = calculateBaselineStrokesGained(getDistance(putts[0], pinLocation).feet);

        stats.strokesGained += (puttExpectedStrokes - putts.length);

        if (putts.length === 1) {
            stats.puttCounts.onePutts++;
        } else if (putts.length === 2) {
            stats.puttCounts.twoPutts++;
        } else {
            stats.puttCounts.threePlusPutts++;
        }

        // --- Loop through each putt on the hole ---
        for (let i = 0; i < putts.length; i++) {
            const isMadePutt = (i === putts.length - 1);
            const startLoc = putts[i];
            const endLoc = isMadePutt ? pinLocation : putts[i + 1];

            const puttDistance = getDistance(startLoc, endLoc);
            stats.totalDistanceFeet += units === 0 ? puttDistance.feet : puttDistance.meters;

            if (!isMadePutt) {
                stats.totalMisses++;

                const missDistance = getDistance(endLoc, pinLocation);
                totalMissDistanceSum += units === 0 ? missDistance.feet : missDistance.meters;

                // --- Calculate Miss Biases (Left/Right, Short/Long) ---
                // We create a coordinate system where the x-axis is the line from the ball to the hole.

                // 1. Vector from ball's start to the pin (the intended line)
                const lineVec = {
                    x: pinLocation.longitude - startLoc.longitude,
                    y: pinLocation.latitude - startLoc.latitude,
                };

                // 2. Vector from where the putt ended to the pin
                const missVec = {
                    x: endLoc.longitude - pinLocation.longitude,
                    y: endLoc.latitude - pinLocation.latitude,
                };

                // 3. Angle of the intended line
                const angle = Math.atan2(lineVec.y, lineVec.x);

                // 4. Rotate the miss vector to align with the intended line
                const rotatedX = missVec.x * Math.cos(-angle) - missVec.y * Math.sin(-angle);
                const rotatedY = missVec.x * Math.sin(-angle) + missVec.y * Math.cos(-angle);

                // Convert degrees to meters/inches
                const latRad = startLoc.latitude * (Math.PI / 180);
                const metersPerLonDegree = METERS_PER_DEGREE * Math.cos(latRad);
                const longMissMeters = rotatedX * metersPerLonDegree; // In this rotated system, X is long/short
                const latMissMeters = rotatedY * METERS_PER_DEGREE;  // Y is left/right

                const longMissInches = longMissMeters * (units === 0 ? 39.3701 : 1);
                const latMissInches = latMissMeters * (units === 0 ? 39.3701 : 1); // Convert to inches if using feet

                shortPastMissSumInches += longMissInches;
                leftRightMissSumInches += latMissInches;

                // Categorize short/long
                if (Math.abs(longMissInches) > Math.abs(latMissInches)) {
                    if (longMissInches < 0) {
                        stats.missDistribution.short++;
                        shortMisses++;
                    } else {
                        stats.missDistribution.long++;
                    }
                } else {
                    // Categorize left/right (positive Y is a left miss)
                    if (latMissInches > (units === 0 ? 18 : 0.5)) stats.missDistribution.farLeft++;
                    else if (latMissInches > (units === 0 ? 3 : 0.1)) stats.missDistribution.left++;
                    else if (latMissInches < (units === 0 ? -18 : -0.5)) stats.missDistribution.farRight++;
                    else if (latMissInches < (units === 0 ? -3 : -0.1)) stats.missDistribution.right++;
                    else stats.missDistribution.center++;
                }

                // --- High Side Percentage ---
                const mid = {
                    x: (startLoc.longitude + pinLocation.longitude) / 2,
                    y: (startLoc.latitude + pinLocation.latitude) / 2
                };
                const grad = getPuttGradient(mid.x, mid.y, lidarGrid);
                const latDiffMeters = lineVec.y * 111320;
                const lonDiffMeters = lineVec.x * 111320 * Math.cos(startLoc.latitude * Math.PI / 180);
                const sideSlope = grad.dx * -latDiffMeters + grad.dy * lonDiffMeters;

                const breaksLeft = sideSlope > 0;
                const missedRight = latMissInches < 0;

                if ((breaksLeft && missedRight) || (!breaksLeft && !missedRight)) {
                    highSideMisses++;
                }
            }
        }
    });

    // --- Final Calculations ---
    if (stats.totalPutts > 0) {
        stats.madePercent = (stats.totalMadePutts / stats.totalPutts);
    }
    if (stats.totalMisses > 0) {
        stats.avgMissFeet = totalMissDistanceSum / stats.totalMisses;
        stats.percentHigh = (highSideMisses / stats.totalMisses);
        stats.percentShort = (shortMisses / stats.totalMisses);
        stats.leftRightBiasInches = leftRightMissSumInches / stats.totalMisses;
        stats.shortPastBiasInches = shortPastMissSumInches / stats.totalMisses;
    }

    // Format numbers for cleaner output
    for (const key in stats) {
        if (typeof stats[key] === 'number') {
            stats[key] = parseFloat(stats[key].toFixed(2));
        }
    }
    for (const key in stats.puttCounts) {
        if (typeof stats.puttCounts[key] === 'number') {
            stats.puttCounts[key] = Math.round(stats.puttCounts[key]);
        }
    }
    for (const key in stats.missDistribution) {
        if (typeof stats.missDistribution[key] === 'number') {
            stats.missDistribution[key] = Math.round(stats.missDistribution[key]);
        }
    }

    return {...stats, detailedPutts};
}

export function calculatePuttingGreenStats(roundData, lidar, units) {
    const detailedPutts = [];
    const stats = {
        totalPutts: 0,
        holesPlayed: 0,
        totalMisses: 0,
        totalMadePutts: 0,
        madePercent: 0,
        strokesGained: 0,
        leftRightBiasInches: 0, // Negative: Left miss, Positive: Right miss
        shortPastBiasInches: 0, // Negative: Short, Positive: Long
        puttCounts: { onePutts: 0, twoPutts: 0, threePlusPutts: 0 },
        totalDistanceFeet: 0,
        percentHigh: 0,
        percentShort: 0,
        missDistribution: {
            farLeft: 0, // > 18 inches left
            left: 0,    // 3-18 inches left
            center: 0,  // < 3 inches left/right
            right: 0,   // 3-18 inches right
            farRight: 0, // > 18 inches right
            long: 0,
            short: 0,
        },
    };

    let totalMissDistanceSum = 0;
    let highSideMisses = 0;
    let shortMisses = 0;
    let leftRightMissSumInches = 0;
    let shortPastMissSumInches = 0;

    roundData.forEach((hole, index) => {
        if (!hole) {
            console.warn("No putt data for hole", hole);
            return;
        }

        let { pinLocation, taps: putts } = hole;
        putts = [hole.startLocation, ...putts];

        detailedPutts.push({
            ...hole,
            totalPutts: putts.length
        });

        if (!putts || putts.length === 0) return;

        stats.holesPlayed++;

        // --- Per-Hole Stats ---
        stats.totalPutts += putts.length;
        stats.totalMadePutts++;

        const firstPuttDist = units === 0 ? getDistance(putts[0], pinLocation).feet : getDistance(putts[0], pinLocation).meters;
        const expectedPutts = getExpectedPutts(firstPuttDist);
        stats.strokesGained += (expectedPutts - putts.length);

        if (putts.length === 1) {
            stats.puttCounts.onePutts++;
        } else if (putts.length === 2) {
            stats.puttCounts.twoPutts++;
        } else {
            stats.puttCounts.threePlusPutts++;
        }

        // --- Loop through each putt on the hole ---
        for (let i = 0; i < putts.length; i++) {
            const isMadePutt = (i === putts.length - 1);
            const startLoc = putts[i];
            const endLoc = isMadePutt ? pinLocation : putts[i + 1];

            const puttDistance = getDistance(startLoc, endLoc);
            stats.totalDistanceFeet += units === 0 ? puttDistance.feet : puttDistance.meters;

            if (!isMadePutt) {
                stats.totalMisses++;

                const missDistance = getDistance(endLoc, pinLocation);
                totalMissDistanceSum += units === 0 ? missDistance.feet : missDistance.meters;

                // --- Calculate Miss Biases (Left/Right, Short/Long) ---
                // We create a coordinate system where the x-axis is the line from the ball to the hole.

                // 1. Vector from ball's start to the pin (the intended line)
                const lineVec = {
                    x: pinLocation.longitude - startLoc.longitude,
                    y: pinLocation.latitude - startLoc.latitude,
                };

                // 2. Vector from where the putt ended to the pin
                const missVec = {
                    x: endLoc.longitude - pinLocation.longitude,
                    y: endLoc.latitude - pinLocation.latitude,
                };

                // 3. Angle of the intended line
                const angle = Math.atan2(lineVec.y, lineVec.x);

                // 4. Rotate the miss vector to align with the intended line
                const rotatedX = missVec.x * Math.cos(-angle) - missVec.y * Math.sin(-angle);
                const rotatedY = missVec.x * Math.sin(-angle) + missVec.y * Math.cos(-angle);

                // Convert degrees to meters/inches
                const latRad = startLoc.latitude * (Math.PI / 180);
                const metersPerLonDegree = METERS_PER_DEGREE * Math.cos(latRad);
                const longMissMeters = rotatedX * metersPerLonDegree; // In this rotated system, X is long/short
                const latMissMeters = rotatedY * METERS_PER_DEGREE;  // Y is left/right

                const longMissInches = longMissMeters * (units === 0 ? 39.3701 : 1);
                const latMissInches = latMissMeters * (units === 0 ? 39.3701 : 1); // Convert to inches if using feet

                shortPastMissSumInches += longMissInches;
                leftRightMissSumInches += latMissInches;

                // Categorize short/long
                if (Math.abs(longMissInches) > Math.abs(latMissInches)) {
                    if (longMissInches < 0) {
                        stats.missDistribution.short++;
                        shortMisses++;
                    } else {
                        stats.missDistribution.long++;
                    }
                } else {
                    // Categorize left/right (positive Y is a left miss)
                    if (latMissInches > (units === 0 ? 18 : 0.5)) stats.missDistribution.farLeft++;
                    else if (latMissInches > (units === 0 ? 3 : 0.1)) stats.missDistribution.left++;
                    else if (latMissInches < (units === 0 ? -18 : -0.5)) stats.missDistribution.farRight++;
                    else if (latMissInches < (units === 0 ? -3 : -0.1)) stats.missDistribution.right++;
                    else stats.missDistribution.center++;
                }

                // --- High Side Percentage ---
                const mid = {
                    x: (startLoc.longitude + pinLocation.longitude) / 2,
                    y: (startLoc.latitude + pinLocation.latitude) / 2
                };
                const grad = getPuttGradient(mid.x, mid.y, lidar);

                const latDiffMeters = lineVec.y * 111320;
                const lonDiffMeters = lineVec.x * 111320 * Math.cos(startLoc.latitude * Math.PI / 180);
                const sideSlope = grad.dx * -latDiffMeters + grad.dy * lonDiffMeters;

                const breaksLeft = sideSlope > 0;
                const missedRight = latMissInches < 0;

                if ((breaksLeft && missedRight) || (!breaksLeft && !missedRight)) {
                    highSideMisses++;
                }
            }
        }
    });

    // --- Final Calculations ---
    if (stats.totalPutts > 0) {
        stats.madePercent = (stats.totalMadePutts / stats.totalPutts);
    }
    if (stats.totalMisses > 0) {
        stats.avgMissFeet = totalMissDistanceSum / stats.totalMisses;
        stats.percentHigh = (highSideMisses / stats.totalMisses);
        stats.percentShort = (shortMisses / stats.totalMisses);
        stats.leftRightBiasInches = leftRightMissSumInches / stats.totalMisses;
        stats.shortPastBiasInches = shortPastMissSumInches / stats.totalMisses;
    }

    // Format numbers for cleaner output
    for (const key in stats) {
        if (typeof stats[key] === 'number') {
            stats[key] = parseFloat(stats[key].toFixed(2));
        }
    }
    for (const key in stats.puttCounts) {
        if (typeof stats.puttCounts[key] === 'number') {
            stats.puttCounts[key] = Math.round(stats.puttCounts[key]);
        }
    }
    for (const key in stats.missDistribution) {
        if (typeof stats.missDistribution[key] === 'number') {
            stats.missDistribution[key] = Math.round(stats.missDistribution[key]);
        }
    }

    return {...stats, detailedPutts};
}

// --- INDIVIDUAL PUTT ANALYSIS ENGINE ---

/**
 * Analyzes every putt in a round to generate a detailed list of metrics for each one.
 * @param {Array<{pinLocation: {latitude, longitude}, putts: Array<{latitude, longitude, misreadSlope?, misreadHit?}>}>} roundData
 * @param greens
 * @param units
 * @returns {Array<object>} An array where each object represents a single putt with detailed stats.
 */
export function analyzeIndividualPutts(roundData, greens, units) {
    const detailedPutts = [];

    roundData.forEach((hole, index) => {
        if (!hole.puttData) {
            console.warn("No putt data for hole", hole);
            return;
        }
        const { pinLocation, taps: putts } = hole.puttData;
        if (!putts || putts.length === 0) return;

        let lidarGrid = null;

        for (const g of greens) {
            if (g.hole === (index+1).toString()) {
                lidarGrid = g.lidar;
                break;
            }
        }

        if (!lidarGrid) {
            console.warn("No lidar grid found for hole", hole);
            return;
        }

        const detailedPuttsForHole = [];

        for (let i = 0; i < putts.length; i++) {
            const startLoc = putts[i];
            const isMadePutt = (i === putts.length - 1);
            const endLoc = isMadePutt ? pinLocation : putts[i + 1];

            const puttDistance = getDistance(startLoc, endLoc);

            let missXDistance = 0;
            let missYDistance = 0;
            let distanceMissed = 0;

            if (!isMadePutt) {
                distanceMissed = (units === 0 ? getDistance(endLoc, pinLocation).feet : getDistance(endLoc, pinLocation).meters);

                // --- Calculate Miss Biases (X/Y relative to target line) ---
                const lineVec = { x: pinLocation.longitude - startLoc.longitude, y: pinLocation.latitude - startLoc.latitude };
                const missVec = { x: endLoc.longitude - pinLocation.longitude, y: endLoc.latitude - pinLocation.latitude };
                const angle = Math.atan2(lineVec.y, lineVec.x);

                const rotatedX = missVec.x * Math.cos(-angle) - missVec.y * Math.sin(-angle);
                const rotatedY = missVec.x * Math.sin(-angle) + missVec.y * Math.cos(-angle);

                const latRad = startLoc.latitude * (Math.PI / 180);
                const metersPerLonDegree = METERS_PER_DEGREE * Math.cos(latRad);

                // Rotated X is now the short/long axis, Y is the left/right axis
                missXDistance = (-rotatedX * metersPerLonDegree) * (units === 0 ? FEET_PER_METER : 1); // Long(+)/Short(-) in feet
                missYDistance = (rotatedY * METERS_PER_DEGREE) * (units === 0 ? FEET_PER_METER : 1);   // Left(+)/Right(-) in feet
            }

            // --- Calculate Break Direction ---
            const midPoint = { x: (startLoc.longitude + pinLocation.longitude) / 2, y: (startLoc.latitude + pinLocation.latitude) / 2 };
            const grad = getPuttGradient(midPoint.x, midPoint.y, lidarGrid);
            const breakVec = { dx: -grad.dx, dy: -grad.dy }; // Gravity pulls downhill, opposite to gradient

            let breakDirection = [0,0];
            if (breakVec.dx !== 0 || breakVec.dy !== 0) {
                const breakAngle = Math.atan2(breakVec.dy, breakVec.dx) * (180 / Math.PI); // Angle in degrees
                if (breakAngle >= -22.5 && breakAngle < 22.5) breakDirection = BREAK_MAP.r;
                else if (breakAngle >= 22.5 && breakAngle < 67.5) breakDirection = BREAK_MAP.tr;
                else if (breakAngle >= 67.5 && breakAngle < 112.5) breakDirection = BREAK_MAP.t;
                else if (breakAngle >= 112.5 && breakAngle < 157.5) breakDirection = BREAK_MAP.tl;
                else if (breakAngle >= 157.5 || breakAngle < -157.5) breakDirection = BREAK_MAP.l;
                else if (breakAngle >= -157.5 && breakAngle < -112.5) breakDirection = BREAK_MAP.bl;
                else if (breakAngle >= -112.5 && breakAngle < -67.5) breakDirection = BREAK_MAP.b;
                else if (breakAngle >= -67.5 && breakAngle < -22.5) breakDirection = BREAK_MAP.br;
            }

            detailedPuttsForHole.push({
                distance: parseFloat((units === 0 ? puttDistance.feet : puttDistance.meters).toFixed(2)),
                missXDistance: parseFloat(missXDistance.toFixed(2)),
                missYDistance: parseFloat(missYDistance.toFixed(2)),
                puttBreak: breakDirection,
                misReadLine: startLoc.misreadLine || false,
                misReadSlope: startLoc.misreadSlope || false,
                distanceMissed: parseFloat(distanceMissed.toFixed(2)),
            });
        }

        detailedPutts.push({
            ...hole,
            puttData: {
                ...hole.puttData,
                totalPutts: putts.length
            },
            putts: detailedPuttsForHole
        });
    });

    return detailedPutts;
}

export const updateStatsForGPSPutt = (stats, hole, putt, puttIndex, pin, lidar) => {
    const {latitude, longitude, misReadLine, misReadSlope} = putt;

    const holeData = hole.puttData ?? hole;

    const isMadePutt = (puttIndex === holeData.taps.length - 1);
    const endLoc = isMadePutt ? pin : holeData.taps[puttIndex + 1];

    const flatDistance = getDistance({latitude, longitude}, pin);
    const category = categorizeDistance(flatDistance.feet, 0); // feet always for categorization
    const distanceIndex = category === "distanceOne" ? 0 : category === "distanceTwo" ? 1 : category === "distanceThree" ? 2 : 3;

    const midPoint = { x: (longitude + pin.longitude) / 2, y: (latitude + pin.latitude) / 2 };
    const grad = getPuttGradient(midPoint.x, midPoint.y, lidar);
    const breakVec = { dx: -grad.dx, dy: -grad.dy }; // Gravity pulls downhill, opposite to gradient

    let breakDirection = [0,0];
    if (breakVec.dx !== 0 || breakVec.dy !== 0) {
        const breakAngle = Math.atan2(breakVec.dy, breakVec.dx) * (180 / Math.PI); // Angle in degrees
        if (breakAngle >= -22.5 && breakAngle < 22.5) breakDirection = BREAK_MAP.r;
        else if (breakAngle >= 22.5 && breakAngle < 67.5) breakDirection = BREAK_MAP.tr;
        else if (breakAngle >= 67.5 && breakAngle < 112.5) breakDirection = BREAK_MAP.t;
        else if (breakAngle >= 112.5 && breakAngle < 157.5) breakDirection = BREAK_MAP.tl;
        else if (breakAngle >= 157.5 || breakAngle < -157.5) breakDirection = BREAK_MAP.l;
        else if (breakAngle >= -157.5 && breakAngle < -112.5) breakDirection = BREAK_MAP.bl;
        else if (breakAngle >= -112.5 && breakAngle < -67.5) breakDirection = BREAK_MAP.b;
        else if (breakAngle >= -67.5 && breakAngle < -22.5) breakDirection = BREAK_MAP.br;
    }

    let missXDistance = 0;
    let missYDistance = 0;
    let distanceMissed = 0;

    // if it is the last putt, we want to add it to the made putt stats
    if (isMadePutt) {
        stats.madePutts.slopes[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][0]++;
        stats.madePutts.overall++;

        stats.madePutts.distance[distanceIndex]++;
    } else {
        distanceMissed = getDistance(endLoc, pin).feet;

        // --- Calculate Miss Biases (X/Y relative to target line) ---
        const lineVec = { x: pin.longitude - longitude, y: pin.latitude - latitude };
        const missVec = { x: endLoc.longitude - pin.longitude, y: endLoc.latitude - pin.latitude };
        const angle = Math.atan2(lineVec.y, lineVec.x);

        const rotatedX = missVec.x * Math.cos(-angle) - missVec.y * Math.sin(-angle);
        const rotatedY = missVec.x * Math.sin(-angle) + missVec.y * Math.cos(-angle);

        const latRad = latitude * (Math.PI / 180);
        const metersPerLonDegree = METERS_PER_DEGREE * Math.cos(latRad);

        stats.avgMiss += distanceMissed;
        stats.avgMissDistance[distanceIndex] += distanceMissed;

        // --- Calculate Miss Biases (Left/Right, Short/Long) ---
        // We create a coordinate system where the x-axis is the line from the ball to the hole.
        const longMissMeters = rotatedX * metersPerLonDegree; // In this rotated system, X is long/short
        const latMissMeters = rotatedY * METERS_PER_DEGREE;  // Y is left/right

        const longMissInches = longMissMeters * 39.3701;
        const latMissInches = latMissMeters * 39.3701; // Convert to inches if using feet

        stats.leftRightBias += latMissInches;
        stats.shortPastBias += longMissInches;

        // // Categorize short/long
        if (longMissInches < 0) {
            stats.percentShort++;
        }
        const latDiffMeters = lineVec.y * 111320;
        const lonDiffMeters = lineVec.x * 111320 * Math.cos(putt.latitude * Math.PI / 180);
        const sideSlope = grad.dx * -latDiffMeters + grad.dy * lonDiffMeters;

        const breaksLeft = sideSlope > 0;
        const missedRight = latMissInches < 0;

        if ((breaksLeft && missedRight) || (!breaksLeft && !missedRight)) {
            stats.percentHigh++;
        }
    }

    if (puttIndex === 0) {
        stats.totalDistance += flatDistance.feet;
        if (holeData.totalPutts === 1) {
            stats.onePutts++;
        }
        else if (holeData.totalPutts === 2) stats["twoPutts"]++;
        else stats["threePutts"]++;
        // this is for the first putt of the hole
        const strokesGained = calculateBaselineStrokesGained(flatDistance.feet) - holeData.totalPutts;
        stats.puttsAHole.distance[distanceIndex] += holeData.totalPutts;

        stats.holesByFirstPuttDistance[distanceIndex]++;

        stats.puttsAHole.slopes[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][0] += holeData.totalPutts;
        stats.puttsAHole.slopes[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][1]++;
        stats.strokesGained.distance[distanceIndex] += strokesGained;
        stats.strokesGained.slopes[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][0] += strokesGained;
        stats.strokesGained.slopes[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][1]++;
    }

    if (misReadLine || misReadSlope) {
        stats.puttsAHole.misreadPuttsAHole++;
        stats.puttsMisread++;
    }

    if (misReadLine) {
        stats.misreads.misreadLineByDistance[distanceIndex]++;
        stats.misreads.misreadLineBySlope[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][0]++;
        stats.misreads.misreadLinePercentage++;
    }

    if (misReadSlope) {
        stats.misreads.misreadSlopeByDistance[distanceIndex]++;
        stats.misreads.misreadSlopeBySlope[STAT_SLOPES[breakDirection[1]]][STAT_BREAKS[breakDirection[0]]][0]++;
        stats.misreads.misreadSlopePercentage++;
    }

    stats.puttsByDistance[distanceIndex]++;
}