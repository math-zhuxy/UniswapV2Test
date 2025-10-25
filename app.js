import { ethers } from "./node_modules/ethers/dist/ethers.js";

document.addEventListener('DOMContentLoaded', () => {
    const nodeUrlInput = document.getElementById('nodeUrl');
    const privateKeyInput = document.getElementById('privateKey');
    const publicKeySpan = document.getElementById('publicKey');
    const scanContractsBtn = document.getElementById('scanContractsBtn');
    const scanStatus = document.getElementById('scanStatus');
    const resultsDiv = document.getElementById('results');
    const contractTypeSelect = document.getElementById('contractType');
    const deployParamsDiv = document.getElementById('deploy-params');
    const deployContractBtn = document.getElementById('deployContractBtn');
    const deployStatus = document.getElementById('deployStatus');
    const contractAddressInput = document.getElementById('contractAddress');
    const contractAbiSelect = document.getElementById('contractAbiSelect');
    const functionSelect = document.getElementById('functionSelect');
    const functionParamsDiv = document.getElementById('function-params');
    const callFunctionBtn = document.getElementById('callFunctionBtn');
    const callResultDiv = document.getElementById('callResult');

    // New elements for account operations
    const balanceAddressInput = document.getElementById('balanceAddress');
    const checkBalanceBtn = document.getElementById('checkBalanceBtn');
    const balanceResultSpan = document.getElementById('balanceResult');
    const toAddressInput = document.getElementById('toAddress');
    const amountInput = document.getElementById('amount');
    const sendEthBtn = document.getElementById('sendEthBtn');
    const sendStatusP = document.getElementById('sendStatus');

    let provider;
    let wallet;
    let abis = {};
    let bytecodes = {};

    const contractDeploymentParams = {
        amm: [
            { name: '_tokenA', type: 'address', placeholder: 'Token A 地址' },
            { name: '_tokenB', type: 'address', placeholder: 'Token B 地址' },
            { name: '_pool_name', type: 'uint256', placeholder: '池名称' },
            { name: '_url', type: 'uint256', placeholder: '图片URL' }
        ],
        e20c: [
            { name: '_name', type: 'uint256', placeholder: '代币名称' },
            { name: '_totalSupply', type: 'uint256', placeholder: '初始供应量' },
            { name: '_url', type: 'uint256', placeholder: '图片URL' }
        ],
        wbkc: [
            { name: '_name', type: 'uint256', placeholder: '名称' },
            { name: '_url', type: 'uint256', placeholder: '图片URL' }
        ]
    };

    async function loadContractArtifacts() {
        try {
            const contracts = ['amm', 'e20c', 'wbkc'];
            for (const contract of contracts) {
                const abiResponse = await fetch(`data/${contract}.abi`);
                if (!abiResponse.ok) throw new Error(`无法加载 ${contract}.abi`);
                abis[contract] = await abiResponse.json();

                const bytecodeResponse = await fetch(`data/${contract}.bytecode`);
                if (!bytecodeResponse.ok) throw new Error(`无法加载 ${contract}.bytecode`);
                bytecodes[contract] = await bytecodeResponse.text();
            }
            console.log('ABI 和 Bytecode 加载成功:', { abis, bytecodes });
            updateFunctionList();
            updateDeployUI();
        } catch (error) {
            console.error('加载合约文件失败:', error);
            alert('加载合约文件失败，请确保 data 文件夹及其中文件存在，并且浏览器可以访问它们。' + error.message);
        }
    }

    function setupWallet() {
        try {
            const nodeUrl = nodeUrlInput.value;
            const privateKey = privateKeyInput.value;
            if (!nodeUrl || !privateKey) {
                // Do not alert on initial load
                return;
            }
            provider = new ethers.JsonRpcProvider(nodeUrl);
            wallet = new ethers.Wallet(privateKey, provider);
            publicKeySpan.textContent = wallet.address;
            balanceAddressInput.value = wallet.address; // Auto-fill balance check address
        } catch (error) {
            alert(`连接失败: ${error.message}`);
            publicKeySpan.textContent = '连接失败';
        }
    }

    privateKeyInput.addEventListener('change', setupWallet);
    nodeUrlInput.addEventListener('change', setupWallet);

    checkBalanceBtn.addEventListener('click', async () => {
        if (!provider) {
            alert('请先连接到节点');
            return;
        }
        const address = balanceAddressInput.value;
        if (!address) {
            alert('请输入要查询的地址');
            return;
        }
        checkBalanceBtn.disabled = true;
        balanceResultSpan.textContent = '查询中...';
        try {
            const balance = await provider.getBalance(address);
            balanceResultSpan.textContent = `${ethers.formatEther(balance)} ETH`;
        } catch (error) {
            console.error('查询余额失败:', error);
            balanceResultSpan.textContent = `查询失败: ${error.message}`;
        } finally {
            checkBalanceBtn.disabled = false;
        }
    });

    sendEthBtn.addEventListener('click', async () => {
        if (!wallet) {
            alert('请先设置节点和私钥');
            return;
        }
        const toAddress = toAddressInput.value;
        const amount = amountInput.value;
        if (!toAddress || !amount) {
            alert('请输入接收方地址和金额');
            return;
        }

        sendEthBtn.disabled = true;
        sendStatusP.textContent = '正在发送...';

        try {
            const tx = {
                to: toAddress,
                value: ethers.parseEther(amount)
            };
            const response = await wallet.sendTransaction(tx);
            sendStatusP.textContent = `交易已发送，等待确认... 哈希: ${response.hash}`;
            const receipt = await response.wait();
            sendStatusP.textContent = `交易成功！区块号: ${receipt.blockNumber}`;
        } catch (error) {
            console.error('发送ETH失败:', error);
            sendStatusP.textContent = `发送失败: ${error.message}`;
        } finally {
            sendEthBtn.disabled = false;
        }
    });

    scanContractsBtn.addEventListener('click', async () => {
        if (!provider) {
            alert('请先设置节点和私钥');
            return;
        }
        scanContractsBtn.disabled = true;
        scanStatus.textContent = '正在扫描区块...';
        resultsDiv.innerHTML = '';

        try {
            const latestBlockNumber = await provider.getBlockNumber();
            scanStatus.textContent = `扫描到最新区块: ${latestBlockNumber}. 开始遍历...`;

            for (let i = 0; i <= latestBlockNumber; i++) {
                if (i % 100 === 0) {
                    scanStatus.textContent = `正在扫描区块 ${i} / ${latestBlockNumber}...`;
                }
                const block = await provider.getBlock(i);
                if (!block) continue;

                for (const txHash of block.transactions) {
                    const tx = await provider.getTransaction(txHash);
                    if (tx && tx.to === null) { // 合约部署交易
                        const receipt = await provider.getTransactionReceipt(tx.hash);
                        if (receipt && receipt.contractAddress) {
                            const contractAddress = receipt.contractAddress;
                            const minimalAbi = [
                                {
                                    "inputs": [],
                                    "name": "contract_type",
                                    "outputs": [
                                        {
                                            "internalType": "uint256",
                                            "name": "",
                                            "type": "uint256"
                                        }
                                    ],
                                    "stateMutability": "view",
                                    "type": "function"
                                }
                            ];
                            const contract = new ethers.Contract(contractAddress, minimalAbi, provider);
                            try {
                                const type = await contract.contract_type();
                                const resultLine = document.createElement('div');
                                resultLine.textContent = `地址: ${contractAddress}, 类型: ${type.toString()}`;
                                resultsDiv.appendChild(resultLine);
                            } catch (e) {
                                // 如果合约没有 contract_type 变量，会抛出异常
                                const resultLine = document.createElement('div');
                                resultLine.textContent = `地址: ${contractAddress}, 类型: 未知 (无法读取 contract_type)`;
                                resultsDiv.appendChild(resultLine);
                            }
                        }
                    }
                }
            }
            scanStatus.textContent = '扫描完成！';
        } catch (error) {
            console.error('扫描区块时出错:', error);
            scanStatus.textContent = `扫描出错: ${error.message}`;
        } finally {
            scanContractsBtn.disabled = false;
        }
    });

    function updateDeployUI() {
        const selectedType = contractTypeSelect.value;
        const params = contractDeploymentParams[selectedType];
        deployParamsDiv.innerHTML = '';
        if (params) {
            params.forEach(param => {
                const input = document.createElement('input');
                input.type = 'text';
                input.id = `deploy-${param.name}`;
                input.placeholder = `${param.placeholder} (${param.type})`;
                input.style.display = 'block';
                input.style.marginTop = '5px';
                deployParamsDiv.appendChild(input);
            });
        }
    }

    contractTypeSelect.addEventListener('change', updateDeployUI);

    deployContractBtn.addEventListener('click', async () => {
        if (!wallet) {
            alert('请先设置节点和私钥');
            return;
        }
        const selectedType = contractTypeSelect.value;
        const abi = abis[selectedType];
        const bytecode = bytecodes[selectedType];

        if (!abi || !bytecode) {
            alert('缺少ABI或Bytecode，请检查合约文件是否加载成功。');
            return;
        }

        deployContractBtn.disabled = true;
        deployStatus.textContent = '正在部署...';

        try {
            const factory = new ethers.ContractFactory(abi, bytecode, wallet);
            const params = contractDeploymentParams[selectedType];
            const args = params.map(param => {
                const input = document.getElementById(`deploy-${param.name}`);
                let value = input.value;
                // 对于 uint256 类型，如果输入的是非十六进制字符串，ethers 可能会尝试将其作为 ENS 名称解析。
                // 我们需要确保将它们转换为 BigInt。
                if (param.type.startsWith('uint') || param.type.startsWith('int')) {
                    try {
                        return ethers.toBigInt(value);
                    } catch (e) {
                        console.warn(`无法将 '${value}' 转换为 BigInt，将尝试使用原始值。`, e);
                        return value; // 如果转换失败，回退到原始值
                    }
                }
                return value;
            });

            const contract = await factory.deploy(...args);
            const deployTx = contract.deploymentTransaction();
            deployStatus.textContent = `部署交易已发送，交易哈希: ${deployTx.hash}`;
            await contract.waitForDeployment();
            deployStatus.textContent = `合约部署成功！地址: ${await contract.getAddress()}`;
            contractAddressInput.value = await contract.getAddress(); // 自动填充到调用部分
        } catch (error) {
            console.error('部署失败:', error);
            deployStatus.textContent = `部署失败: ${error.message}`;
        } finally {
            deployContractBtn.disabled = false;
        }
    });

    function updateFunctionList() {
        const selectedAbiName = contractAbiSelect.value;
        const abi = abis[selectedAbiName];
        functionSelect.innerHTML = '';
        if (abi) {
            abi.filter(item => item.type === 'function').forEach(func => {
                const option = document.createElement('option');
                option.value = func.name;
                option.textContent = func.name;
                functionSelect.appendChild(option);
            });
            updateFunctionParams();
        }
    }

    function updateFunctionParams() {
        const selectedAbiName = contractAbiSelect.value;
        const abi = abis[selectedAbiName];
        const functionName = functionSelect.value;
        functionParamsDiv.innerHTML = '';

        if (abi && functionName) {
            const func = abi.find(item => item.type === 'function' && item.name === functionName);
            if (func && func.inputs) {
                func.inputs.forEach((input, index) => {
                    const inputElem = document.createElement('input');
                    inputElem.type = 'text';
                    inputElem.id = `param-${index}`;
                    inputElem.placeholder = `${input.name} (${input.type})`;
                    inputElem.style.display = 'block';
                    inputElem.style.marginTop = '5px';
                    functionParamsDiv.appendChild(inputElem);
                });
            }
            // Special case for wBKC mintToken to add value input
            if (selectedAbiName === 'wbkc' && functionName === 'mintToken') {
                const valueInput = document.createElement('input');
                valueInput.type = 'text';
                valueInput.id = 'eth-value-input';
                valueInput.placeholder = '交易金额 (ETH)';
                valueInput.style.display = 'block';
                valueInput.style.marginTop = '5px';
                functionParamsDiv.appendChild(valueInput);
            }
        }
    }

    contractAbiSelect.addEventListener('change', updateFunctionList);
    functionSelect.addEventListener('change', updateFunctionParams);

    callFunctionBtn.addEventListener('click', async () => {
        if (!wallet) {
            alert('请先设置节点和私钥');
            return;
        }
        const address = contractAddressInput.value;
        const selectedAbiName = contractAbiSelect.value;
        const abi = abis[selectedAbiName];
        const functionName = functionSelect.value;

        if (!address || !abi || !functionName) {
            alert('请填写合约地址并选择函数');
            return;
        }

        callFunctionBtn.disabled = true;
        callResultDiv.textContent = '正在调用...';

        try {
            const contract = new ethers.Contract(address, abi, wallet);
            const func = abi.find(item => item.type === 'function' && item.name === functionName);
            const args = [];
            if (func.inputs) {
                func.inputs.forEach((input, index) => {
                    const inputElem = document.getElementById(`param-${index}`);
                    args.push(inputElem.value);
                });
            }

            const overrides = {};
            const valueInput = document.getElementById('eth-value-input');
            if (valueInput && valueInput.value) {
                overrides.value = ethers.parseEther(valueInput.value);
            }

            const result = await contract[functionName](...args, overrides);

            if (typeof result === 'object' && result.wait) { // It's a transaction
                callResultDiv.textContent = `交易已发送，等待确认... 哈希: ${result.hash}`;
                const receipt = await result.wait();
                callResultDiv.textContent = `交易已确认！\n区块号: ${receipt.blockNumber}\nGas用量: ${receipt.gasUsed.toString()}`;
            } else {
                callResultDiv.textContent = `调用成功！结果: \n${JSON.stringify(result, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value, 2)}`;
            }

        } catch (error) {
            console.error('函数调用失败:', error);
            callResultDiv.textContent = `调用失败: ${error.message}`;
        } finally {
            callFunctionBtn.disabled = false;
        }
    });

    // 初始化
    loadContractArtifacts();
    setupWallet();
});
