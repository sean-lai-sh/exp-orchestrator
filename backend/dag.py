def topological_order(nodes, edges):
    from collections import defaultdict, deque
    indeg = defaultdict(int)
    graph = defaultdict(list)
    for e in edges:
        graph[e.src].append(e.dst)
        indeg[e.dst] += 1
        indeg.setdefault(e.src, 0)

    q = deque([n for n in nodes if indeg[n] == 0])
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in graph[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    if len(order) != len(nodes):
        raise ValueError("Cycle detected")
    return order, graph
