/*
 Copyright 2011 Lazar Laszlo (lazarsoft@gmail.com, www.lazarsoft.info)

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import Detector from './detector';
import Decoder from './decoder';
import * as bradleyAdapt from "./bradleyAdaptive";

export var qrcode = {};
qrcode.sizeOfDataLengthInfo = [[10, 9, 8, 8], [12, 11, 16, 10], [14, 13, 16, 12]];

export default class QrCode {

  constructor(options) {
    options = options || {};
    this.imagedata = null;
    this.width = 0;
    this.height = 0;
    this.qrCodeSymbol = null;
    this.debug = false;
    this.detectFine = options.detectFine || false;

    this.callback = null;
  }


  decodeImageData(imageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.imagedata = imageData;

    this._decode();
  }

  decodeUrlData(url) {
    var image = new Image();
    image.crossOrigin = "Anonymous";

    image.onload = () => {
      var canvas_qr = document.createElement('canvas');
      var context = canvas_qr.getContext('2d');
      var canvas_out = document.getElementById("out-canvas");

      if(canvas_out != null) {

        var outctx = canvas_out.getContext('2d');
        outctx.clearRect(0, 0, 320, 240);
        outctx.drawImage(image, 0, 0, 320, 240);
      }

      canvas_qr.width = image.width;
      canvas_qr.height = image.height;
      context.drawImage(image, 0, 0);
      this.width = image.width;
      this.height = image.height;

      try {
        this.imagedata = context.getImageData(0, 0, image.width, image.height);
      } catch(e) {
        this.result = "Cross domain image reading not supported in your browser! Save it to your computer then drag and drop the file!";
        if(this.callback != null) return this.callback(null, this.result);
      }
      this._decode();
    };
    image.src = url;
  }

  _decode() {
    try {
      this.error = undefined;
      this.result = this.process();
    } catch (e) {
      this.error = e;
      this.result = {points: this.QRCodePoints.points};
    }

    if (typeof this.callback === 'function') {
      this.callback(this.error, this.result);
    } else {
      console.log(this.error, this.result);
    }
  }

  decode_utf8(s) {
    return decodeURIComponent(escape(s));
  }

  static binariseBradley(imageData) {
    return bradleyAdapt.binariseOutput(
      bradleyAdapt.computeAdaptiveThreshold(imageData, 0.9));
  }

  static binariseThreshold(imageData) {
    return QrCode.grayScaleToBitmap(QrCode.grayscale(imageData));
  }

  process() {
    const start = new Date().getTime();

    const binariseOptions = [QrCode.binariseBradley, QrCode.binariseThreshold];
    for (var binOpt = 0; binOpt < binariseOptions.length; binOpt++) {
      try {
        this.binImage = binariseOptions[binOpt](this.imagedata);
        var detector = new Detector(this.binImage);

        this.QRCodePoints = detector.detect(this.detectFine);

        const reader = Decoder.decode(this.QRCodePoints.bits);
        var str = this.readData(reader);
        break;
      } catch (e) {
        if (binOpt == binariseOptions.length - 1) {
          throw e;
        }
      }
    }


    var end = new Date().getTime();
    var time = end - start;
    if (this.debug) {
      console.log('QR Code processing time (ms): ' + time);
    }

    return {result: this.decode_utf8(str), points: this.QRCodePoints.points};
  }

  readData(reader) {
    var data = reader.DataByte;
    var str = "";
    for (var i = 0; i < data.length; i++) {
      for (var j = 0; j < data[i].length; j++)
        str += String.fromCharCode(data[i][j]);
    }
    return str;
  }

  static getPixel(imageData, x, y) {
    if (imageData.width < x) {
      throw "point error";
    }
    if (imageData.height < y) {
      throw "point error";
    }
    var point = (x * 4) + (y * imageData.width * 4);
    return (imageData.data[point] * 33 + imageData.data[point + 1] * 34 + imageData.data[point + 2] * 33) / 100;
  }

  static binarize(th) {
    var ret = new Array(this.width * this.height);
    for (var y = 0; y < this.height; y++) {
      for (var x = 0; x < this.width; x++) {
        var gray = QrCode.getPixel(x, y);
        var pixel = x + y * this.width;
        if (x > 1) {
          if (ret[pixel - 1]) {
            ret[pixel] = gray <= th - 50;
          } else {
            ret[pixel] = gray <= th - 50;
          }
        } else {
          ret[pixel] = gray <= th;
        }
      }
    }
    return ret;
  }

  static getMiddleBrightnessPerArea(imageData) {
    var numSqrtArea = 2;
    //obtain middle brightness((min + max) / 2) per area
    var areaWidth = Math.floor(imageData.width / numSqrtArea);
    var areaHeight = Math.floor(imageData.height / numSqrtArea);
    var minmax = new Array(numSqrtArea);
    for (var i = 0; i < numSqrtArea; i++) {
      minmax[i] = new Array(numSqrtArea);
      for (var i2 = 0; i2 < numSqrtArea; i2++) {
        minmax[i][i2] = [0, 0, new Array(255)];
      }
    }
    for (var ay = 0; ay < numSqrtArea; ay++) {
      for (var ax = 0; ax < numSqrtArea; ax++) {
        minmax[ax][ay][0] = 0xFF;
        for (var dy = 0; dy < areaHeight; dy++) {
          for (var dx = 0; dx < areaWidth; dx++) {
            var target = imageData.data[areaWidth * ax + dx + (areaHeight * ay + dy) * imageData.width];
            minmax[ax][ay][2][target] = (minmax[ax][ay][2][target] || 0) + 1;
            if (target < minmax[ax][ay][0])
              minmax[ax][ay][0] = target;
            if (target > minmax[ax][ay][1])
              minmax[ax][ay][1] = target;
          }
        }
      }
    }
    var middle = new Array(numSqrtArea);
    for (var i3 = 0; i3 < numSqrtArea; i3++) {
      middle[i3] = new Array(numSqrtArea);
    }
    for (var ay = 0; ay < numSqrtArea; ay++) {
      for (var ax = 0; ax < numSqrtArea; ax++) {
        middle[ax][ay] = Math.floor((minmax[ax][ay][0] + minmax[ax][ay][1]) / 2);
      }
    }
    var altMiddle = minmax.map(mmY => mmY.map(v => {
      var mean = v[2].reduce((r, t) => r + t, 0) / 2;
      var val = 0;
      for (var i = 0; val < mean / 2; i++)
        val = val + (v[2][i] || 0);
      return i;
    }));
    console.info("Middle:", middle, altMiddle);
    return altMiddle;
  }

  static grayScaleToBitmap(grayScaleImageData) {
    var middle = QrCode.getMiddleBrightnessPerArea(grayScaleImageData);
    var sqrtNumArea = middle.length;
    var areaWidth = Math.floor(grayScaleImageData.width / sqrtNumArea);
    var areaHeight = Math.floor(grayScaleImageData.height / sqrtNumArea);

    for (var ay = 0; ay < sqrtNumArea; ay++) {
      for (var ax = 0; ax < sqrtNumArea; ax++) {
        for (var dy = 0; dy < areaHeight; dy++) {
          for (var dx = 0; dx < areaWidth; dx++) {
            var pixId = areaWidth * ax + dx + (areaHeight * ay + dy) * grayScaleImageData.width;
            grayScaleImageData.data[pixId] = (grayScaleImageData.data[pixId] < middle[ax][ay]);
          }
        }
      }
    }
    return grayScaleImageData;
  }

  static grayscale(imageData) {
    var ret = new Uint8ClampedArray(imageData.width * imageData.height);
    for (var y = 0; y < imageData.height; y++) {
      for (var x = 0; x < imageData.width; x++) {
        var gray = QrCode.getPixel(imageData, x, y);
        ret[x + y * imageData.width] = gray;
      }
    }
    return {
      height: imageData.height,
      width: imageData.width,
      data: ret
    };
  }

}

export function URShift(number, bits) {
  if (number >= 0)
    return number >> bits;
  else
    return (number >> bits) + (2 << ~bits);
}
