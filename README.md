功能启动一个基于replicaSet 的mongoDB服务，可以为TIS 提供CDC 测试
## 执行操作


```
## 启动
docker-compose up -d
## 进入docker container
docker exec -ti mongodb-cdc-test /bin/bash
```

进入mongoDB 控制台
```
mongosh -u admin -p password

```
初始化replicSet集群，只有一个primary 节点，使用init-mongo.js脚本
> TODO：  奇怪，文件中的脚本并没有在容器启动时候一并执行，所以这里暂时只能手动执行了


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
docker exec -it mongodb-cdc-test mongosh \
  -u admin \                # 管理员用户名（默认在初始化脚本中创建）
  -p password \             # 管理员密码
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



### **生产环境建议**


#### **3. 密钥文件安全**
```bash
# 密钥文件权限必须为 600
openssl rand -base64 756 > mongo-keyfile/mongodb-keyfile && chmod 755 ./mongo-keyfile && chown 999:999 ./mongo-keyfile && chmod 600 mongo-keyfile/mongodb-keyfile && chown 999:999 mongo-keyfile/mongodb-keyfile
```

---

### **完整操作流程**
```bash
#  创建用户
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
