import { pathToFileURL } from 'url';
import _ from 'lodash-es';
import promiseLimit from 'promise-limit';
import { createCache, getCache } from './cache.mjs';
import logError from './logError.mjs';
import { retryGet } from './retry.mjs';

const dlImgLimit = promiseLimit(4);

class CQCode {
  /**
   * @param {string} type
   * @param {Record<string, any>} data
   */
  constructor(type, data) {
    this.type = type;
    this.data = data ? new Map(Object.entries(data)) : new Map();
  }

  /**
   * @param {string} key
   */
  get(key) {
    return this.data.get(key);
  }

  /**
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    this.data.set(key, value);
    return this;
  }

  /**
   * @param {Record<string, any>} obj
   */
  mset(obj) {
    Object.entries(obj).forEach(kv => this.set(...kv));
    return this;
  }

  /**
   * @param {string} key
   */
  del(key) {
    this.data.delete(key);
    return this;
  }

  toString() {
    const list = Array.from(this.data.entries())
      .filter(([, v]) => !_.isNil(v))
      .map(kv => kv.map(CQCode.escapeInsideCQ).join('='));
    list.unshift(`CQ:${this.type}`);
    return `[${list.join(',')}]`;
  }

  /**
   * @param {string[]} keys
   */
  pickData(keys) {
    return _.pick(Object.fromEntries(this.data.entries()), keys);
  }

  /**
   * @param {string} str
   */
  static from(str) {
    const reg = /\[CQ:([^,[\]]+)((?:,[^,=[\]]+=[^,[\]]*)*)\]/g;
    const result = [];
    // eslint-disable-next-line space-in-parens
    for (let match; (match = reg.exec(str)); ) {
      const [, type, dataStr] = match;
      const data = _.transform(
        _.filter(dataStr.split(',')),
        (obj, kv) => {
          const [key, ...value] = kv.split('=');
          obj[CQCode.unescape(key)] = CQCode.unescape(value.join('='));
        },
        {}
      );
      result.push(new CQCode(type, data));
    }
    return result;
  }

  /**
   * 转义
   * @template T
   * @param {T} str 欲转义的字符串
   * @param {boolean} [insideCQ=false] 是否在CQ码内
   * @return {T}
   */
  static escape(str, insideCQ = false) {
    if (typeof str !== 'string') return str;
    const result = str.replace(/&/g, '&amp;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;');
    if (!insideCQ) return result;
    return result
      .replace(/,/g, '&#44;')
      .replace(/(\ud83c[\udf00-\udfff])|(\ud83d[\udc00-\ude4f\ude80-\udeff])|[\u2600-\u2B55]/g, ' ');
  }

  /**
   * 反转义
   * @template T
   * @param {T} str 欲反转义的字符串
   * @return {T}
   */
  static unescape(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&#44;/g, ',').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');
  }

  /**
   * 在CQ码内转义
   * @template T
   * @param {T} str 欲转义的字符串
   */
  static escapeInsideCQ(str) {
    return CQCode.escape(str, true);
  }

  /**
   * CQ码 图片
   * @param {string} file 本地文件路径或URL
   * @param {'flash'|'show'} [type] 类型
   */
  static img(file, type) {
    return new CQCode('image', { file, type }).toString();
  }

  /**
   * CQ码 图片 下载再发送
   * @param {string} url 本地文件路径或URL
   * @param {'flash'|'show'} [type] 类型
   * @param {import('axios').AxiosRequestConfig} [config] Axios 配置
   */
  static async imgPreDl(url, type, config = {}) {
    try {
      let path = getCache(url);
      if (!path) {
        const { data } = await dlImgLimit(() => retryGet(url, { responseType: 'arraybuffer', ...config }));
        path = createCache(url, data);
      }
      return new CQCode('image', { file: pathToFileURL(path), type }).toString();
    } catch (e) {
      logError('[error] cq img pre-download');
      logError(e);
    }
    return new CQCode('image', { file: url, type }).toString();
  }

  /**
   * CQ码 Base64 图片
   * @param {string} base64 图片 Base64
   * @param {'flash'|'show'} [type] 类型
   */
  static img64(base64, type) {
    return new CQCode('image', { file: `base64://${base64}`, type }).toString();
  }

  /**
   * CQ码 视频
   * @param {string} file 本地文件路径或URL
   * @param {string} cover 本地文件路径或URL
   */
  static video(file, cover) {
    return new CQCode('video', { file, cover }).toString();
  }

  /**
   * CQ码 分享链接
   * @param {string} url 链接
   * @param {string} title 标题
   * @param {string} content 内容
   * @param {string} image 图片URL
   */
  static share(url, title, content, image) {
    return new CQCode('share', { url, title, content, image }).toString();
  }

  /**
   * CQ码 @
   * @param {number} qq
   */
  static at(qq) {
    return new CQCode('at', { qq }).toString();
  }

  /**
   * CQ码 @全体成员
   */
  static atAll() {
    return '[CQ:at,qq=all]';
  }

  /**
   * CQ码 回复
   * @param {number} id 消息ID
   */
  static reply(id) {
    return new CQCode('reply', { id }).toString();
  }

  /**
   * CQ码 语音
   * @param {string} file 本地文件路径或URL
   */
  static record(file) {
    return new CQCode('record', { file }).toString();
  }
}

const CQ = CQCode;

export default CQ;
