# MongoDB Replica Set with Keyfile Authentication

基于 Docker Compose 的 MongoDB 副本集环境，支持 CDC（Change Data Capture）测试，使用 Keyfile 进行集群内认证。

## 目录

- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [用户和权限](#用户和权限)
- [使用指南](#使用指南)
- [测试数据](#测试数据)
- [故障排查](#故障排查)
- [安全建议](#安全建议)

---

## 功能特性

- ✅ 单节点 MongoDB 副本集（Replica Set）
- ✅ 自动初始化副本集配置
- ✅ Keyfile 认证保护集群通信
- ✅ 预创建 CDC 测试用户和数据库
- ✅ 支持 Change Stream 和 Oplog 读取
- ✅ 数据持久化到本地目录
- ✅ 健康检查和自动重启

---

## 项目结构

```
.
├── docker-compose.yaml        # Docker Compose 配置文件
├── custom-entrypoint.sh       # MongoDB 自定义启动脚本
├── init-mongo.js              # 数据库初始化脚本
├── mongo-keyfile/             # Keyfile 存储目录
│   └── mongodb-keyfile        # 集群认证密钥文件
├── mongo-data/                # MongoDB 数据持久化目录（自动生成）
├── mongo-config/              # MongoDB 配置持久化目录（自动生成）
└── README.md                  # 本文档
```

---

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用内存
- 至少 10GB 可用磁盘空间

---

## 快速开始

### 1. 克隆或下载项目

```bash
cd /opt/misc/mongo-docker-compose
```

### 2. 启动服务

```bash
# 启动 MongoDB 和初始化客户端
docker-compose up -d

# 查看启动日志
docker-compose logs -f mongodb

# 查看初始化日志
docker-compose logs mongo-client
```

### 3. 验证服务状态

```bash
# 检查容器状态
docker ps | grep mongo

# 验证副本集状态
docker exec mongo-client mongosh \
  --host mongodb --port 27017 \
  -u admin -p password \
  --authenticationDatabase admin \
  --eval "rs.status()" --quiet
```

**预期输出**：
```javascript
{
  set: 'rs0',
  myState: 1,  // 1 表示 PRIMARY
  members: [
    {
      name: 'localhost:27017',
      stateStr: 'PRIMARY',
      health: 1
    }
  ]
}
```

### 4. 停止服务

```bash
# 停止但保留数据
docker-compose down

# 停止并删除所有数据（谨慎操作！）
docker-compose down -v
rm -rf mongo-data/* mongo-config/*
```

---

## 配置说明

### Docker Compose 配置

**主要参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| 镜像版本 | `mongo:7.0.12` | MongoDB 版本 |
| 端口映射 | `27017:27017` | 暴露给宿主机 |
| 副本集名称 | `rs0` | Replica Set ID |
| Oplog 大小 | `128MB` | Change Stream 日志容量 |
| 认证模式 | `keyFile` | 集群内认证方式 |

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MONGO_INITDB_ROOT_USERNAME` | `admin` | 管理员用户名 |
| `MONGO_INITDB_ROOT_PASSWORD` | `password` | 管理员密码 |

**⚠️ 生产环境请务必修改默认密码！**

### 持久化目录

| 目录 | 用途 | 权限要求 |
|------|------|----------|
| `./mongo-data` | 数据库文件 | MongoDB 用户（UID 999）可读写 |
| `./mongo-config` | 配置文件 | MongoDB 用户（UID 999）可读写 |
| `./mongo-keyfile` | 认证密钥 | MongoDB 用户（UID 999）只读（400） |

---

## 用户和权限

### 预创建用户

启动后自动创建以下用户：

#### 1. 管理员用户

```javascript
用户名: admin
密码:   password
角色:   root (所有数据库的超级管理员)
认证库: admin
```

**连接示例**：
```bash
mongosh --host localhost --port 27017 \
  -u admin -p password \
  --authenticationDatabase admin
```

#### 2. CDC 用户

```javascript
用户名: cdc_user
密码:   cdc_password
角色:
  - read@tis    (读取业务数据库)
  - read@local  (读取 Oplog 进行 CDC)
认证库: admin
```

**连接示例**：
```bash
mongosh --host localhost --port 27017 \
  -u cdc_user -p cdc_password \
  --authenticationDatabase admin
```

### 创建新用户

使用管理员账号创建新用户：

```javascript
// 连接 MongoDB
mongosh --host localhost --port 27017 -u admin -p password --authenticationDatabase admin

// 创建具有读写权限的用户
use admin
db.createUser({
  user: "myuser",
  pwd: "mypassword",
  roles: [
    { role: "readWrite", db: "mydb" }
  ]
})

// 创建只读用户
db.createUser({
  user: "readonly_user",
  pwd: "readonly_pass",
  roles: [
    { role: "read", db: "mydb" }
  ]
})
```

### 常用角色说明

| 角色 | 权限范围 | 适用场景 |
|------|----------|----------|
| `read` | 只读数据 | 报表查询、CDC 消费 |
| `readWrite` | 读写数据 | 应用程序常规操作 |
| `dbAdmin` | 管理数据库 | 创建索引、查看统计信息 |
| `dbOwner` | 数据库所有权限 | 数据库管理员 |
| `userAdmin` | 管理用户 | 创建删除用户 |
| `root` | 所有权限 | 超级管理员 |

---

## 使用指南

### 基本操作

#### 连接到 MongoDB

```bash
# 方式 1：直接在宿主机连接
mongosh --host localhost --port 27017 -u admin -p password --authenticationDatabase admin

# 方式 2：进入容器后连接
docker exec -it mongodb-cdc-test mongosh -u admin -p password --authenticationDatabase admin

# 方式 3：使用已配置的客户端容器
docker exec -it mongo-client mongosh --host mongodb -u admin -p password --authenticationDatabase admin
```

#### 常用 MongoDB 命令

```javascript
// 显示所有数据库
show dbs

// 切换数据库
use tis

// 显示当前数据库的所有集合
show collections

// 查看集合文档数量（精确）
db.test_collection.countDocuments({})

// 查看集合文档数量（估算，速度快）
db.test_collection.estimatedDocumentCount()

// 查询数据
db.test_collection.find().limit(10)

// 插入数据
db.test_collection.insertOne({ name: "test", value: 123 })

// 更新数据
db.test_collection.updateOne(
  { name: "test" },
  { $set: { value: 456 } }
)

// 删除数据
db.test_collection.deleteOne({ name: "test" })
```

### 副本集管理

```javascript
// 查看副本集状态
rs.status()

// 查看副本集配置
rs.conf()

// 查看当前节点是否为 PRIMARY
db.isMaster()

// 查看 Oplog 状态
use local
db.oplog.rs.find().sort({$natural: -1}).limit(5)
```

### CDC (Change Data Capture) 示例

#### 使用 Change Stream

```javascript
// 连接到 MongoDB
use tis

// 创建 Change Stream 监听所有变更
const changeStream = db.test_collection.watch();

// 处理变更事件
changeStream.on('change', (change) => {
  console.log(JSON.stringify(change, null, 2));
});

// 在另一个终端执行数据变更
db.test_collection.insertOne({ test: "cdc event" })
```

#### 读取 Oplog

```javascript
// 使用 CDC 用户连接
mongosh --host localhost --port 27017 \
  -u cdc_user -p cdc_password \
  --authenticationDatabase admin

// 读取最近的 Oplog
use local
db.oplog.rs.find().sort({$natural: -1}).limit(10).pretty()
```

---

## 测试数据

### 插入测试文档

```javascript
use tis

// 简单文档
db.test_collection.insertOne({
  name: "test_user",
  age: 30,
  email: "test@example.com",
  createdAt: new Date()
})

// 全类型字段测试文档
db.full_types.insertOne({
  "_id": ObjectId("5d505646cf6d4fe581014ab0"),
  "stringField": "hello",
  "uuidField": UUID("0bd1e27e-2829-4b47-8e21-dfef93da44e1"),
  "md5Field": MD5("2078693f4c61ce3073b01be69ab76428"),
  "timeField": ISODate("2019-08-11T17:54:14.692Z"),
  "dateField": ISODate("2019-08-11T17:54:14.692Z"),
  "dateBefore1970": ISODate("1960-08-11T17:54:14.692Z"),
  "dateToTimestampField": ISODate("2019-08-11T17:54:14.692Z"),
  "dateToLocalTimestampField": ISODate("2019-08-11T17:54:14.692Z"),
  "timestampField": Timestamp(1565545664, 1),
  "timestampToLocalTimestampField": Timestamp(1565545664, 1),
  "booleanField": true,
  "decimal128Field": NumberDecimal("10.99"),
  "doubleField": 10.5,
  "int32field": NumberInt("10"),
  "int64Field": NumberLong("50"),
  "documentField": { "a": "hello", "b": NumberLong("50") },
  "mapField": {
    "inner_map": {
      "key": NumberLong("234")
    }
  },
  "arrayField": ["hello", "world"],
  "doubleArrayField": [1.0, 1.1, null],
  "documentArrayField": [
    { "a": "hello0", "b": NumberLong("51") },
    { "a": "hello1", "b": NumberLong("53") }
  ],
  "minKeyField": MinKey(),
  "maxKeyField": MaxKey(),
  "regexField": /^H/i,
  "undefinedField": undefined,
  "nullField": null,
  "binaryField": BinData(0, "AQID"),
  "javascriptField": function() { return x++; },
  "dbReferenceField": DBRef("ref_doc", ObjectId("5d505646cf6d4fe581014ab3"))
});
```

### 批量插入测试

```javascript
use tis

// 批量插入 1000 条文档
const bulkOps = [];
for (let i = 0; i < 1000; i++) {
  bulkOps.push({
    insertOne: {
      document: {
        index: i,
        name: `user_${i}`,
        value: Math.random() * 100,
        timestamp: new Date()
      }
    }
  });
}

db.test_collection.bulkWrite(bulkOps);
print("Inserted 1000 documents");
```

---

## 故障排查

### 问题 1：容器不断重启

**症状**：
```bash
docker ps -a
# STATUS: Restarting
```

**诊断步骤**：
```bash
# 查看容器日志
docker logs mongodb-cdc-test --tail 100

# 常见错误信息
# "Unable to acquire security key[s]" - Keyfile 权限问题
# "No such file or directory" - Keyfile 不存在
```

**解决方案**：
```bash
# 检查 keyfile 权限
ls -la mongo-keyfile/mongodb-keyfile
# 应该显示: -r-------- 1 mongodb mongodb 1024

# 如果权限不对，重新设置
chmod 400 mongo-keyfile/mongodb-keyfile

# 重新启动
docker-compose down
docker-compose up -d
```

---

### 问题 2：认证失败

**症状**：
```bash
MongoServerError: Authentication failed
```

**诊断步骤**：
```bash
# 1. 检查用户是否存在
docker exec mongo-client mongosh --host mongodb -u admin -p password \
  --authenticationDatabase admin \
  --eval "db.getUsers()" --quiet

# 2. 检查副本集状态
docker exec mongo-client mongosh --host mongodb -u admin -p password \
  --authenticationDatabase admin \
  --eval "rs.status()" --quiet
```

**解决方案**：
```bash
# 如果 admin 用户不存在，需要清空数据重新初始化
docker-compose down
rm -rf mongo-data/* mongo-config/*
docker-compose up -d
```

---

### 问题 3：副本集未初始化

**症状**：
```javascript
rs.status()
// Error: "no replset config has been received"
```

**解决方案**：
```bash
# 手动执行初始化脚本
docker exec mongo-client mongosh --host mongodb -u admin -p password \
  --authenticationDatabase admin \
  /scripts/init-mongo.js
```

---

### 问题 4：无法读取 Oplog

**症状**：
```javascript
use local
db.oplog.rs.find()
// Error: "not authorized"
```

**解决方案**：
```bash
# 确认用户有 local 数据库的读权限
mongosh -u admin -p password --authenticationDatabase admin

use admin
db.getUser("cdc_user")
// 确认输出包含: { role: "read", db: "local" }

# 如果没有权限，添加权限
db.grantRolesToUser("cdc_user", [{ role: "read", db: "local" }])
```

---

### 问题 5：容器启动后数据库为空

**症状**：
- 容器正常运行但没有 `tis` 数据库
- `cdc_user` 用户不存在

**原因**：
初始化脚本 `init-mongo.js` 未执行或执行失败

**解决方案**：
```bash
# 1. 检查 mongo-client 容器日志
docker logs mongo-client | grep -i error

# 2. 手动执行初始化脚本
docker exec mongo-client mongosh \
  --host mongodb --port 27017 \
  -u admin -p password \
  --authenticationDatabase admin \
  --quiet /scripts/init-mongo.js

# 3. 验证结果
docker exec mongo-client mongosh \
  --host mongodb -u admin -p password \
  --authenticationDatabase admin \
  --eval "show dbs" --quiet
```

---

### 问题 6：端口冲突

**症状**：
```bash
Error starting userland proxy: listen tcp4 0.0.0.0:27017: bind: address already in use
```

**解决方案**：
```bash
# 1. 查找占用 27017 端口的进程
lsof -i :27017
# 或
netstat -tuln | grep 27017

# 2. 停止占用端口的服务
sudo systemctl stop mongod  # 如果是系统安装的 MongoDB

# 3. 或修改 docker-compose.yaml 中的端口映射
# ports:
#   - "27018:27017"  # 映射到宿主机的 27018 端口
```

---

## 安全建议

### 生产环境配置

#### 1. 修改默认密码

编辑 `docker-compose.yaml`：

```yaml
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: <strong_password_here>  # 使用强密码
```

同时修改 `init-mongo.js` 中的 CDC 用户密码：

```javascript
adminDb.createUser({
  user: "cdc_user",
  pwd: "<strong_cdc_password>",  // 修改密码
  roles: [
    { role: "read", db: "tis" },
    { role: "read", db: "local" }
  ]
});
```

#### 2. 重新生成 Keyfile

```bash
# 生成新的 keyfile
openssl rand -base64 756 > mongo-keyfile/mongodb-keyfile

# 设置正确的权限
chmod 400 mongo-keyfile/mongodb-keyfile

# 重启服务
docker-compose down
docker-compose up -d
```

#### 3. 限制网络访问

编辑 `docker-compose.yaml`，仅在内网监听：

```yaml
ports:
  - "127.0.0.1:27017:27017"  # 仅本机访问
  # 或配置防火墙规则限制访问源 IP
```

#### 4. 启用 TLS/SSL

在生产环境应启用 TLS 加密通信（需要额外配置证书）。

#### 5. 定期备份

```bash
# 全量备份
docker exec mongodb-cdc-test mongodump \
  --uri="mongodb://admin:password@localhost:27017/?authSource=admin" \
  --out=/data/backup/$(date +%Y%m%d)

# 恢复备份
docker exec mongodb-cdc-test mongorestore \
  --uri="mongodb://admin:password@localhost:27017/?authSource=admin" \
  /data/backup/20231215
```

#### 6. 监控和日志

```bash
# 实时查看日志
docker logs -f mongodb-cdc-test

# 查看 MongoDB 慢查询日志
docker exec mongodb-cdc-test mongosh -u admin -p password \
  --authenticationDatabase admin \
  --eval "db.setProfilingLevel(1, { slowms: 100 })"

# 查看慢查询记录
docker exec mongodb-cdc-test mongosh -u admin -p password \
  --authenticationDatabase admin \
  --eval "db.system.profile.find().limit(10).pretty()"
```

---

## 常见问题 (FAQ)

### Q1: 如何扩展到多节点副本集？

A: 修改 `docker-compose.yaml` 添加更多 MongoDB 节点，并在 `init-mongo.js` 中配置多个 members。

### Q2: Keyfile 认证和用户认证有什么区别？

A:
- **Keyfile 认证**：用于副本集成员之间的内部通信认证
- **用户认证**：用于客户端连接到数据库的认证

### Q3: 可以在不停机的情况下修改 Keyfile 吗？

A: 不可以，修改 Keyfile 需要重启所有副本集成员。

### Q4: 如何清空所有数据重新开始？

A:
```bash
docker-compose down
rm -rf mongo-data/* mongo-config/*
docker-compose up -d
```

### Q5: Change Stream 和 Oplog 有什么区别？

A:
- **Change Stream**：MongoDB 4.0+ 提供的高级 API，自动处理游标恢复
- **Oplog**：底层的操作日志，需要手动管理游标位置

推荐使用 Change Stream 进行 CDC。

---

## 参考资料

- [MongoDB 官方文档](https://www.mongodb.com/docs/)
- [MongoDB Replica Set 部署](https://www.mongodb.com/docs/manual/replication/)
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)
- [MongoDB Keyfile 认证](https://www.mongodb.com/docs/manual/tutorial/enforce-keyfile-access-control-in-existing-replica-set/)
- [Docker Compose 文档](https://docs.docker.com/compose/)

---

## 许可证

本项目仅供学习和测试使用。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

**最后更新**: 2025-12-23
