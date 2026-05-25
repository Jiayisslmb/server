// 测试转发API的实际HTTP调用

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/content/articles/1/repost?action=count_only',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-token', // 使用测试token
  }
};

const req = http.request(options, (res) => {
  console.log(`\n📡 HTTP响应状态码: ${res.statusCode}`);
  console.log(`📋 响应头:`, JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n📦 响应体:');
    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));

      console.log('\n✅ 数据结构分析:');
      if (jsonData.reposts !== undefined) {
        console.log(`   - reposts字段: ${jsonData.reposts} ✓`);
      } else {
        console.log('   - ❌ 缺少reposts字段！');
        console.log(`   - 实际返回的字段: ${Object.keys(jsonData).join(', ')}`);
      }

      if (jsonData.success !== undefined) {
        console.log(`   - success字段: ${jsonData.success}`);
      }
    } catch (e) {
      console.log('❌ JSON解析失败:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ 请求失败: ${e.message}`);
});

req.end();

console.log('🚀 发送测试请求到后端API...');
console.log(`📍 URL: ${options.hostname}:${options.port}${options.path}`);
console.log(`🔧 方法: ${options.method}`);