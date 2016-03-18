/**
 * @copyright Maichong Software Ltd. 2016 http://maichong.it
 * @date 2016-03-17
 * @author Liang <liang@maichong.it>
 */

'use strict';

const alaska = require('alaska');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const mime = require('mime');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const ALI = require('aliyun-sdk');

exports.plain = mongoose.Schema.Types.Mixed;

/**
 * 初始化Schema
 * @param field   alaksa.Model中的字段配置
 * @param schema
 * @param Model
 */
exports.initSchema = function (field, schema, Model) {

  ['Bucket', 'oss'].forEach(function (key) {
    if (!field[key]) {
      throw new Error('Aliyun image field config "' + key + '" is required in ' + Model.name + '.' + field.path);
    }
  });

  if (!field.oss.putObject) {
    field.oss = new ALI.OSS(field.oss);
  }

  let defaultValue = field.default || {};

  let paths = {};

  function addPath(path, type) {
    let options = { type };
    if (defaultValue[path] !== undefined) {
      options.default = defaultValue[path];
    }
    paths[path] = options;
  }

  addPath('_id', mongoose.Schema.Types.ObjectId);
  addPath('ext', String);
  addPath('path', String);
  addPath('url', String);
  addPath('thumbUrl', String);
  addPath('name', String);
  addPath('size', Number);

  let imageSchema = new mongoose.Schema(paths);

  if (field.multi) {
    imageSchema = [imageSchema];
  }

  schema.add({
    [field.path]: imageSchema
  });

  if (!field.dir) {
    field.dir = '';
  }

  if (!field.pathFormat) {
    field.pathFormat = '';
  }

  if (!field.prefix) {
    field.prefix = '';
  }

  if (!field.thumbSuffix && field.thumbSuffix !== false) {
    field.thumbSuffix = '@2o_200w_1l_90Q.jpg';
  }

  if (!field.allowed) {
    field.allowed = ['jpg', 'png', 'gif'];
  }

  Model.underscoreMethod(field.path, 'upload', function (file) {
    let record = this;
    return field.type.upload(file, field).then(function (img) {
      record.set(field.path, img);
      return Promise.resolve();
    });
  });

  Model.underscoreMethod(field.path, 'data', function () {
    let value = this.get(field.path);
    return value && value.url ? value.url : '';
  });
};

/**
 * alaska-admin-view 前端控件初始化参数
 * @param field
 * @param Model
 */
exports.viewOptions = function (field, Model) {
  let options = alaska.Field.viewOptions.apply(this, arguments);
  options.multi = field.multi;
  options.allowed = field.allowed;
  if (!options.cell) {
    options.cell = 'ImageFieldCell';
  }
  if (!options.view) {
    options.view = 'ImageFieldView';
  }
  return options;
};

/**
 * 上传
 * @param {File|string|Buffer} file
 * @param {Field} field
 * @returns {{}}
 */
exports.upload = function (file, field) {
  return new Promise(function (resolve, reject) {
    if (!file) {
      return reject(new Error('File not found'));
    }
    let name = file.filename || '';
    let ext = file.ext;
    let mimeType = file.mime || file.mimeType;
    let filePath;

    function onReadFile(error, data) {
      if (error) {
        return reject(error);
      }

      let url = field.prefix;
      let id = new ObjectId();
      let img = {
        _id: id,
        ext: ext,
        size: data.length,
        path: '',
        thumbUrl: '',
        url: '',
        name: name
      };
      if (field.pathFormat) {
        img.path += moment().format(field.pathFormat);
      }
      img.path += id.toString() + '.' + img.ext;
      url += img.path;
      img.thumbUrl = img.url = url;
      if (field.thumbSuffix) {
        img.thumbUrl += field.thumbSuffix;
      }

      field.oss.putObject({
        Bucket: field.Bucket,
        Key: img.path,
        Body: data,
        AccessControlAllowOrigin: field.AccessControlAllowOrigin,
        ContentType: mimeType,
        CacheControl: field.CacheControl || 'no-cache',
        ContentDisposition: field.ContentDisposition || '',
        ServerSideEncryption: field.ServerSideEncryption,
        Expires: field.Expires
      }, function (error, res) {
        if (error) {
          return reject(error);
        }
        resolve(img);
      });
    }

    if (Buffer.isBuffer(file)) {
      //文件数据
      if (!mimeType) {
        mimeType = 'image/jpeg';
      }
    } else if (typeof file === 'string') {
      //文件路径
      mimeType = mime.lookup(file);
      name = path.basename(file);
      filePath = file;
    } else if (file.path) {
      //上传文件
      filePath = file.path;
    } else {
      return reject(new Error('Unknown image file'));
    }

    if (!ext) {
      ext = mime.extension(mimeType).replace('jpeg', 'jpg');
    }
    if (field.allowed.indexOf(ext) < 0) {
      return reject(new Error('Image format error'));
    }

    if (filePath) {
      fs.readFile(file.path, onReadFile);
    } else {
      onReadFile(null, file);
    }
  });
};
