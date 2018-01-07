ProxAPI
=======

Pass through proxy that caches received documents on MongoBD and redirects requests that don't hit the cache to a configurable source.

Mappings work the following way:

```json
{
  "routes": [
    { "from": "/service1", "to": "http://services-dev-01:10000" }
  ]
}
```
