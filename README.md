功能启动一个基于replicaSet 的mongoDB服务，可以为TIS 提供CDC 测试
## 执行操作


```
## 启动
docker-compose up -d
## 进入docker container
docker exec -ti mongodb /bin/bash
```

进入mongoDB 控制台
```
mongosh -u root -p example


```
初始化replicSet集群，只有一个primary 节点
> TODO： init-mongo.js 奇怪，文件中的脚本并没有在容器启动时候一并执行，所以这里暂时只能手动执行了
``` shell
rs.initiate({
  _id: "rs0",
  members: [{
    _id: 0,
    host: "mongodb:27017"
  }]
});

sleep(5000);


db.getSiblingDB("admin").createUser({
  user: "root",
  pwd: "example",
  roles: [ { role: "root", db: "admin" } ]
});
```

验证是否正常
``` shell
rs.status()
```

常用mongoDB DML语句
``` javascript
// 显示数据库
show dbs
// 显示表
show collections

// 使用精确统计（推荐）
db.your_collection_name.countDocuments({})

// 或使用元数据估算（更快但不精确）
db.your_collection_name.estimatedDocumentCount()
```
## 权限相关
---

### **问题根源**
出现 `MongoServerError[Unauthorized]: command createUser requires authentication` 错误，表明当前用户 **没有权限创建新用户**。在 MongoDB 中，创建用户需要管理员权限，尤其是在启用了副本集和认证的环境中。以下是详细分析和解决方案：

---

### **错误原因**
1. **未以管理员身份认证**  
   创建用户需要 `userAdmin` 或更高权限的角色，但当前连接的用户未通过认证或权限不足。

2. **副本集未完成初始化**  
   如果 MongoDB 处于副本集初始化阶段，某些管理命令可能被暂时禁止。

3. **未启用认证模式**  
   如果 MongoDB 未以 `--auth` 参数启动，即使配置了用户，权限系统也不会生效。

---

### **解决方案**
通过以下步骤正确创建用户：

---

#### **步骤 1：以管理员身份连接到 MongoDB**
```bash
# 进入容器并使用 root 用户认证
docker exec -it mongodb mongosh \
  -u root \                # 管理员用户名（默认在初始化脚本中创建）
  -p example \             # 管理员密码
  --authenticationDatabase admin  # 认证数据库必须为 admin
```

---

#### **步骤 2：验证副本集状态**
```javascript
// 检查副本集是否已初始化
rs.status()

// 预期输出应包含：
// "ok": 1,
// "set": "rs0",
// "members": [ { "stateStr": "PRIMARY" } ]
```

---

#### **步骤 3：在目标数据库创建用户**
```javascript
// 切换到目标数据库（例如 test）
use test

// 创建用户并授予权限
db.createUser({
  user: "tis",
  pwd: "123456",
  roles: [ { role: "dbOwner", db: "test" } ]
})
```

---

#### **步骤 4：验证用户权限**
```javascript
// 查看用户权限
db.getUser("tis")

// 预期输出：
{
  "user": "tis",
  "roles": [ { "role": "dbOwner", "db": "test" } ]
}
```

---

### **关键配置检查**
#### **1. 确保 MongoDB 启用认证**
在 `docker-compose.yml` 中，MongoDB 服务必须包含 `--auth` 参数：
```yaml{11}
services:
  mongodb:
    image: mongo:6.0
    command: [
      "--replSet", "rs0",
      "--bind_ip_all",
      "--keyFile", "/etc/mongo-keyfile",
      "--auth"  # 👈 必须启用认证
    ]
    environment:
      MONGO_INITDB_ROOT_USERNAME: root
      MONGO_INITDB_ROOT_PASSWORD: example
```

#### **2. 初始化脚本权限**
在 `init-mongo.js` 中，确保副本集初始化后创建管理员用户：
```javascript{3,8-13}
// 初始化副本集
rs.initiate({ _id: "rs0", members: [ { _id: 0, host: "mongodb:27017" } ] });

// 等待主节点选举完成
sleep(5000);

// 在 admin 数据库创建管理员用户（关键步骤！）
db.getSiblingDB("admin").createUser({
  user: "root",
  pwd: "example",
  roles: [ { role: "root", db: "admin" } ]
});
```

---

### **权限层级说明**
| 角色 | 权限范围 | 能否创建用户 |
|------|----------|--------------|
| `root` | 跨数据库 | ✅ 是（最高权限） |
| `userAdmin` | 单数据库 | ✅ 是（仅限本库） |
| `dbOwner` | 单数据库 | ❌ 否（需额外授权） |
| `readWrite` | 单数据库 | ❌ 否 |

---

### **生产环境建议**
#### **1. 独立权限管理**
```javascript
// 创建专用用户管理角色
use admin
db.createRole({
  role: "userAdminForTest",
  privileges: [
    { resource: { db: "test", collection: "" }, actions: ["createUser", "dropUser"] }
  ],
  roles: []
})

// 将角色授予用户
db.grantRolesToUser("tis", ["userAdminForTest"])
```

#### **2. 网络隔离**
```yaml
# docker-compose.yml 中限制 MongoDB 仅内部访问
services:
  mongodb:
    networks:
      - internal
    ports:
      - "27017"  # 不暴露到宿主机
```

#### **3. 密钥文件安全**
```bash
# 密钥文件权限必须为 600
chmod 600 mongo-keyfile
chown 999:999 mongo-keyfile  # MongoDB 容器用户 UID=999
```

---

### **完整操作流程**
```bash
# 1. 清理旧环境
docker-compose down -v

# 2. 重新生成密钥文件
openssl rand -base64 768 > mongo-keyfile
chmod 600 mongo-keyfile
sudo chown 999:999 mongo-keyfile

# 3. 启动服务
docker-compose up -d --build

# 4. 创建用户
docker exec -it mongodb mongosh \
  -u root -p example --authenticationDatabase admin \
  --eval "use test; db.createUser({ user: 'tis', pwd: '123456', roles: [{ role: 'dbOwner', db: 'test' }] })"
```

---

### **故障排查**
#### **场景 1：未找到管理员用户**
若初始化脚本未正确创建 `root` 用户：
```bash
# 临时关闭认证进入容器
docker exec -it mongodb mongosh --eval "
  use admin
  db.createUser({
    user: 'root',
    pwd: 'example',
    roles: [ { role: 'root', db: 'admin' } ]
  })"
```

#### **场景 2：副本集未初始化**
手动初始化副本集：
```bash
docker exec -it mongodb mongosh \
  -u root -p example --authenticationDatabase admin \
  --eval "rs.initiate()"
```

---

通过以上步骤，即可解决因权限不足导致的用户创建失败问题，同时为生产环境提供安全加固建议。
