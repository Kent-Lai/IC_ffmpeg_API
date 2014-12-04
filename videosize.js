/*jshint node:true*/
'use strict';

/*
 *! Size helpers
 */


/**
 * Return filters to pad video to width*height,
 *
 * @param {Number} width output width
 * @param {Number} height output height
 * @param {Number} aspect video aspect ratio (without padding)
 * @param {Number} color padding color
 * @return scale/pad filters
 * @private
 */
function getScalePadFilters(width, height, aspect, color) {
  /*
    let a be the input aspect ratio, A be the requested aspect ratio

    if a > A, padding is done on top and bottom
    if a < A, padding is done on left and right
   */

  return [
    /*
      In both cases, we first have to scale the input to match the requested size.
      When using computed width/height, we truncate them to multiples of 2
     */
    {
      filter: 'scale',
      options: {
        w: 'if(gt(a,' + aspect + '),' + width + ',trunc(' + height + '*a/2)*2)',
        h: 'if(lt(a,' + aspect + '),' + height + ',trunc(' + width + '/a/2)*2)'
      }
    },

    /*
      Then we pad the scaled input to match the target size
      (here iw and ih refer to the padding input, i.e the scaled output)
     */

    {
      filter: 'pad',
      options: {
        w: width,
        h: height,
        x: 'if(gt(a,' + aspect + '),0,(' + width + '-iw)/2)',
        y: 'if(lt(a,' + aspect + '),0,(' + height + '-ih)/2)',
        color: color
      }
    }
  ];
}


/**
 * Recompute size filters
 *
 * @param {Object} output
 * @param {String} key newly-added parameter name ('size', 'aspect' or 'pad')
 * @param {String} value newly-added parameter value
 * @return filter string array
 * @private
 */
function createSizeFilters(output, key, value) {
  // Store parameters
  var data = output.sizeData = output.sizeData || {};
  data[key] = value;

  if (!('size' in data)) {
    // No size requested, keep original size
    return [];
  }

  // Try to match the different size string formats
  var fixedSize = data.size.match(/([0-9]+)x([0-9]+)/);
  var fixedWidth = data.size.match(/([0-9]+)x\?/);
  var fixedHeight = data.size.match(/\?x([0-9]+)/);
  var percentRatio = data.size.match(/\b([0-9]{1,3})%/);
  var width, height, aspect;

  if (percentRatio) {
    var ratio = Number(percentRatio[1]) / 100;
    return [{
      filter: 'scale',
      options: {
        w: 'trunc(iw*' + ratio + '/2)*2',
        h: 'trunc(ih*' + ratio + '/2)*2'
      }
    }];
  } else if (fixedSize) {
    // Round target size to multiples of 2
    width = Math.round(Number(fixedSize[1]) / 2) * 2;
    height = Math.round(Number(fixedSize[2]) / 2) * 2;

    aspect = width / height;

    if (data.pad) {
      return getScalePadFilters(width, height, aspect, data.pad);
    } else {
      // No autopad requested, rescale to target size
      return [{ filter: 'scale', options: { w: width, h: height }}];
    }
  } else if (fixedWidth || fixedHeight) {
    if ('aspect' in data) {
      // Specified aspect ratio
      width = fixedWidth ? fixedWidth[1] : Math.round(Number(fixedHeight[1]) * data.aspect);
      height = fixedHeight ? fixedHeight[1] : Math.round(Number(fixedWidth[1]) / data.aspect);

      // Round to multiples of 2
      width = Math.round(width / 2) * 2;
      height = Math.round(height / 2) * 2;

      if (data.pad) {
        return getScalePadFilters(width, height, data.aspect, data.pad);
      } else {
        // No autopad requested, rescale to target size
        return [{ filter: 'scale', options: { w: width, h: height }}];
      }
    } else {
      // Keep input aspect ratio

      if (fixedWidth) {
        return [{
          filter: 'scale',
          options: {
            w: Math.round(Number(fixedWidth[1]) / 2) * 2,
            h: 'trunc(ow/a/2)*2'
          }
        }];
      } else {
        return [{
          filter: 'scale',
          options: {
            w: 'trunc(oh*a/2)*2',
            h: Math.round(Number(fixedHeight[1]) / 2) * 2
          }
        }];
      }
    }
  } else {
    throw new Error('Invalid size specified: ' + data.size);
  }
}

exports.createSizeFilters = createSizeFilters;
