// เมื่อ refresh browser ให้เคลียร์ input ออกไปด้วย
window.addEventListener("load", () => {
  document.querySelector('#periodChoice').value = "lastWeek"
  convertPeriodChoice("lastWeek")
});

let loader = document.querySelector('#loader');
const periodChoice = document.querySelector('#periodChoice')


periodChoice.addEventListener('change', () => {
    
    const dateRange = document.querySelector('.dateRange')
    
    const periodChoiceValue = document.querySelector('#periodChoice').value
    convertPeriodChoice(periodChoiceValue)

    if (periodChoiceValue === "specifyRange") {
        dateRange.style.display = "flex"
    } else {
        dateRange.style.display = "none"
    }
    
})



const btnFetchReport = document.querySelector('#fetchReport')

btnFetchReport.addEventListener('click', async () => {

    // Clear Report
    document.querySelector('.ctn-report').innerHTML = ''

    // Validate inputs
    const isValidDomain    = document.querySelector('#domain')   .value !== '';
    const isValidAuthToken = document.querySelector('#authToken').value !== '';
    
    if (!isValidDomain || !isValidAuthToken) alert('กรุณาใส่ domain และ auth token')

    if (isValidDomain || isValidAuthToken) {

        // Get authentication
        const {domain, requestOptions} = getAuth()

        // Input
        const ticketType = document.querySelector('#ticketType').value
        let fromDate     = document.querySelector('#fromDate').value
        let toDate       = document.querySelector('#toDate').value

        // Fetch ticket list
        let ticketList = await getAllTickets(ticketType, fromDate, toDate, domain, requestOptions)
        let ticketId_arr = []
        if (ticketList.length > 0) {
            ticketList.forEach((item) => {
                const ticketObj = {
                    parent_ticket_id:       item.id,
                    parent_ticket_priority: item.priority,
                    parent_created_at:      item.created_at
                }

                const priorityMap = {
                    1: "Low",
                    2: "Medium",
                    3: "High",
                    4: "Urgent"
                }

                const olaMap = {
                    1: "14 Days",
                    2: "7 Days",
                    3: "72 Hrs",
                    4: "24 Hrs"
                }

                ticketObj['parent_ticket_priority_value'] = priorityMap[item.priority]
                ticketObj['parent_ticket_ola']            = olaMap[item.priority]
                
                ticketId_arr.push(ticketObj)
            })
        

        // console.log(ticketId_arr)

        let taskList = await getAllTasks(ticketId_arr, domain, requestOptions)
        // เรียง group_id จาก น้อยไปมาก
        taskList.sort((a, b) => {
            // sort ตาม group_id ก่อน
            if (a.group_id !== b.group_id) {
                return a.group_id - b.group_id;
            }

            // ถ้า group_id เท่ากัน sort ต่อด้วย agent_id
            if (a.agent_id !== b.agent_id) {
                return a.agent_id - b.agent_id;
            }

            // ถ้า agent_id เท่ากัน sort ต่อด้วย ticket_id
            return a.ticket_id - b.ticket_id;
        });
        console.log(taskList)
        
        // สร้าง report
        generateReport(taskList)

        // ลบข้อความ loading
        loader.innerHTML = ''

        } else {
            // แจ้งข้อความไม่พบข้อมูล
            loader.innerHTML = 'ไม่พบข้อมูล'
        }

    }

})



// GET AUTHENCATION
function getAuth() {
  
    const domain = document.querySelector('#domain').value;

    const username = document.querySelector('#authToken').value;
    const password = "X";

    // สร้าง string "user:password"
    const credentials = `${username}:${password}`;

    // แปลงเป็น Base64
    const encodedCredentials = btoa(credentials);

    // สร้าง Headers object
    const myHeaders = new Headers();
    myHeaders.append("Authorization", `Basic ${encodedCredentials}`);

    const requestOptions = {
        method:   "GET",
        headers:  myHeaders,
        redirect: "follow",
    };

    return {
        domain: domain,
        requestOptions: requestOptions
    };


  
}

// API GET TICKET LIST
async function getAllTickets(ticket_type, from_date, to_date, domain, requestOptions) {
    let page = 1;
    let hasTickets = true;
    let list = [];
    let query = `created_at:>'${from_date}' AND created_at:<'${to_date}'`

    loader.innerHTML = ''

   while (hasTickets) {
        let URL_GETALLTICKETS = `https://${domain}.freshservice.com/api/v2/${ticket_type}`;
        ticket_type === 'tickets' ? URL_GETALLTICKETS = URL_GETALLTICKETS + '/filter' : null
        URL_GETALLTICKETS = URL_GETALLTICKETS + `?query="${query}"&per_page=100&page=${page}`
        
        try {
            const response = await fetch(URL_GETALLTICKETS, requestOptions);
            const result   = await response.json();

            if (response.ok) {

                // ใช้ mapping แทน switch
                const typeMap = {
                    tickets: result.tickets,
                    changes: result.changes
                };
                
                const list_perpage = typeMap[ticket_type]
                if (list_perpage.length > 0) {

                    list.push(...list_perpage);

                    loader.innerHTML = `Loading number of ticket ... ${list.length}`;
                
                } else {
                    hasTickets = false;
                }

            } else {
                alert(result.message || `Error ${response.status}`);
                hasTickets = false; // stop loop ถ้า error
            }

        } catch (e) {
            console.error(e);
            hasTickets = false; // stop loop ถ้า error
        }

        page++;
    }

    if (list.length === 0) {
        loader.innerHTML = 'no data'
    }

    return list;
}

// API GET TASK DETAILS FOLLOWS BY TICKET ID OF CHANGES ONLY
async function getAllTasks(ticket_id_arr, domain, requestOptions) {

    let taskList = []

    for (const [idx, item] of ticket_id_arr.entries()) {
        const {
            parent_ticket_id,
            parent_ticket_priority,
            parent_ticket_priority_value,
            parent_ticket_ola,
            parent_created_at
        } = item
        
        let URL_GETALLTASKSBYTICKETID = `https://${domain}.freshservice.com/api/v2/changes/${parent_ticket_id}/tasks`;

         try {
            loader.innerHTML    = `Loading task list ... ticket id ${parent_ticket_id}`;

            const response = await fetch(URL_GETALLTASKSBYTICKETID, requestOptions);
            const result   = await response.json();
            const data_arr = await result.tasks
            
            if (response.ok) {

                if (data_arr.length > 0) {
                    
                    // filter เฉพาะ status ที่ completed เท่านั้น และ agent_id ไม่เท่ากับ null
                    const task_completed_arr = data_arr.filter((task) => task.status === 3)
                    // const task_completed_arr = data_arr.filter((task) => task.status === 3 && task.agent_id !== null) // filter agent เพิ่ม

                    if (task_completed_arr.length > 0) {

                        for (const [idx, task] of task_completed_arr.entries()) {
                            // เพิ่ม parent ticket id และ parent created at
                            task_completed_arr[idx]['parent_ticket_id']             = parent_ticket_id;
                            task_completed_arr[idx]['parent_ticket_priority']       = parent_ticket_priority;
                            task_completed_arr[idx]['parent_ticket_priority_value'] = parent_ticket_priority_value;
                            task_completed_arr[idx]['parent_ticket_ola']            = parent_ticket_ola;
                            task_completed_arr[idx]['local_parent_created_at']      = convertLocalFormat(parent_created_at);

                            // เพิ่ม local date time
                            task_completed_arr[idx]['local_planned_start_date'] = convertLocalFormat(task.planned_start_date)
                            task_completed_arr[idx]['local_planned_end_date']   = convertLocalFormat(task.planned_end_date)
                            task_completed_arr[idx]['local_created_at']         = convertLocalFormat(task.created_at)
                            task_completed_arr[idx]['local_closed_at']          = convertLocalFormat(task.closed_at)
                            task_completed_arr[idx]['local_due_date']           = convertLocalFormat(task.due_date)

                            // หาชื่อ agent
                            if (task.agent_id !== null) {
                                loader.innerHTML    = `Loading task (${task.id}) infomation ... agent id ${task.agent_id}`;

                                let URL_GETANAGENT  = `https://${domain}.freshservice.com/api/v2/agents/${task.agent_id}`;
                                const responseAgent = await fetch(URL_GETANAGENT, requestOptions)
                                const resultAgent   = await responseAgent.json();
                                const dataAgentObj  = await resultAgent.agent;
      
                                const agentName     = await dataAgentObj.first_name + ' ' + dataAgentObj.last_name

                                task_completed_arr[idx]['agent_value'] = agentName
                            } else {
                                task_completed_arr[idx]['agent_value'] = null
                            }

                            // หาชื่อ group
                            if (task.group_id !== null) {
                                loader.innerHTML    = `Loading task (${task.id}) infomation ... group id ${task.group_id}`;

                                let URL_GETGROUP = `https://${domain}.freshservice.com/api/v2/groups/${task.group_id}`;
                                const responseGroup = await fetch(URL_GETGROUP, requestOptions)
                                const resultGroup   = await responseGroup.json();
                                const dataGroupObj  = await resultGroup.group;
                                const groupName     = await dataGroupObj.name

                                task_completed_arr[idx]['group_value'] = groupName
                            } else {
                                task_completed_arr[idx]['group_value'] = null
                            }

                            // หา completed duration = closed_at - due_date
                            // แปลง string → Date
                            const closedAt = new Date(task.closed_at);
                            const dueDate  = new Date(task.due_date);

                            let diffSec = (closedAt - dueDate) / 1000;

                            // ถ้าติดลบ ให้เป็น 0
                            if (diffSec < 0) diffSec = 0;

                            // คำนวณ วัน ชั่วโมง นาที วินาที
                            const days = Math.floor(diffSec / (24 * 60 * 60));
                            diffSec %= 24 * 60 * 60;
                            const hours = Math.floor(diffSec / (60 * 60));
                            diffSec %= 60 * 60;
                            const minutes = Math.floor(diffSec / 60);
                            const seconds = Math.floor(diffSec % 60);


                            task_completed_arr[idx]['completed_duration_day']    = days
                            task_completed_arr[idx]['completed_duration_hour']   = hours
                            task_completed_arr[idx]['completed_duration_minute'] = minutes

                            // ตรวจสอบ comply จาก completed duration
                            if (days > 0 || hours > 0 || minutes > 0) {
                                task_completed_arr[idx]['comply'] = 'NC'
                            } else {
                                task_completed_arr[idx]['comply'] = 'C'
                            }

                        }
                        
                    }

                    taskList.push(...task_completed_arr);
                    
                    
                
                }

            } else {
                alert(result.message || `Error ${response.status}`);
            }

        } catch (e) {
            console.error(e);
        }

    }

    return taskList

}





// ฟังก์ชันย้อนวันจาก Select Period
function convertPeriodChoice(choice) {

    // Input
    let fromDate = document.querySelector('#fromDate').value
    let toDate   = document.querySelector('#toDate').value

     // วันปัจจุบัน
    const today = new Date();
    // ย้อนวัน
    const past = new Date();

    switch (choice) {
        case "lastWeek":
            past.setDate(today.getDate() - 7);
            break;
        case "lastMonth":
            past.setDate(today.getDate() - 30);
            break;
        case "lastYear":
            past.setDate(today.getDate() - 365);
            break;
        case "last2Year":
            past.setDate(today.getDate() - 365 * 2);
            break;
        case "last3Year":
            past.setDate(today.getDate() - 365 * 3);
            break;
        case "specifyRange":
            past.setDate(today.getDate() - 30);
            break;
    }

    document.getElementById("fromDate").value = formatDate(past);
    fromDate = formatDate(past)

    document.getElementById("toDate").value = formatDate(today);
    toDate = formatDate(today)    
}


// ฟังก์ชันแปลงวันที่เป็น yyyy-MM-dd
function formatDate(date) {
    let d = new Date(date),
        month = ("0" + (d.getMonth() + 1)).slice(-2),
        day   = ("0" + d.getDate()).slice(-2),
        year  = d.getFullYear();
    return `${year}-${month}-${day}`;
}

// พังก์ชั่นแปลง utc เป็น local
function convertLocalFormat(utcDate) {
  // Convert to Date object
  const date = new Date(utcDate);

  // Format with Intl.DateTimeFormat in GMT+7
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", // GMT+7
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const formatted = formatter.format(date);
  return formatted
}


// GENERATE REPORT
async function generateReport(list) {
    let report = document.querySelector('.ctn-report')

    let ticket_row = ''
    let summary_row = ''
    let table_layout = ''

    report.innerHTML += `<div style="margin-top: 25px; background-color: #d1fff0ff;">${list[0].group_value || 'no assign group'}</div>`

    if (list.length > 0) {

        list.forEach((i, idx) => {            
            
            const prev_idx = idx === 0 ? 0 : idx - 1

            if (i.group_value !== list[prev_idx].group_value || i.agent_value !== list[prev_idx].agent_value) {

                // คำนวนจำนวนสำหรับบรรทัดสรุป
                const summary_list = list.filter((task) => task.group_value === list[prev_idx].group_value && task.agent_value === list[prev_idx].agent_value)
                const count_all = summary_list.length
                const count_c = summary_list.filter((c) => c.comply === "C").length
                const count_nc = summary_list.filter((c) => c.comply === "NC").length

                const percent_c = count_all > 0 ? ((count_c * 100) / count_all).toFixed(2) : 0;
                const percent_nc = count_all > 0 ? ((count_nc * 100) / count_all).toFixed(2) : 0;

                // เพิ่มบรรทัดสรุป
                summary_row = `
                    <tr>
                        <td>รวม ${count_all} เรื่อง</td>
                        <td colspan="2">ดำเนินการตามกำหนด ${count_c} เรื่อง</td>
                        <td colspan="11">คิดเป็น ${percent_c} %</td>
                    </tr>
                    <tr>
                        <td></td>
                        <td colspan="2">ดำเนินการไม่ตามกำหนด ${count_nc} เรื่อง</td>
                        <td colspan="11">คิดเป็น ${percent_nc} %</td>
                    </tr>
                `

                table_layout = `
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">Agent Group</th>
                                <th rowspan="2">Task Owner</th>
                                <th rowspan="2">เลขที่ Change (task id)</th>
                                <th rowspan="2">Priority Change</th>
                                <th rowspan="2">OLA Complete within (Hardcode)</th>
                                <th rowspan="2">Report Date</th>
                                <th rowspan="2">Summary</th>
                                <th rowspan="2">Target Start</th>
                                <th rowspan="2">Target Finish</th>
                                <th rowspan="2">Actual Start</th>
                                <th rowspan="2">Actual Finish</th>
                                <th rowspan="2">Due Date</th>
                                <th rowspan="2">Comply</th>
                                <th colspan="3">ระยะเวลาดำเนินการ</th>
                            </tr>
                            <tr>
                                <th>วัน</th>
                                <th>ชั่วโมง</th>
                                <th>นาที</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${ticket_row}                        
                        </tbody>
                        <tfoot>
                        ${summary_row}
                        </tfoot>
                    </table>
                `
                // ออก ตาราง
                report.innerHTML += `${table_layout}`                

                // print ชื่อ group ใหม่
                report.innerHTML += `<div style="margin-top: 25px; background-color: #d1fff0ff;">${i.group_value || 'no assign group'}</div>`

                // ล้าง row ใน table
                ticket_row = ''
            }

            ticket_row += `
                <tr>
                    <td>${i.group_value || ''}</td>
                    <td>${i.agent_value || ''}</td>
                    <td>${i.parent_ticket_id} (${i.id})</td>
                    <td>${i.parent_ticket_priority_value}</td>
                    <td>${i.parent_ticket_ola}</td>
                    <td>${i.local_parent_created_at}</td>
                    <td>${i.title}</td>
                    <td>${i.local_planned_start_date}</td>
                    <td>${i.local_planned_end_date}</td>
                    <td>${i.local_created_at}</td>
                    <td>${i.local_closed_at}</td>
                    <td>${i.local_due_date}</td>
                    <td>${i.comply}</td>
                    <td>${i.completed_duration_day}</td>
                    <td>${i.completed_duration_hour}</td>
                    <td>${i.completed_duration_minute}</td>
                </tr>
            `

            // record ศุดท้าย
            if (idx + 1 === list.length) {

                // คำนวนจำนวนสำหรับบรรทัดสรุป
                const summary_list = list.filter((task) => task.group_value === list[idx].group_value && task.agent_value === list[idx].agent_value)
                const count_all = summary_list.length
                const count_c = summary_list.filter((c) => c.comply === "C").length
                const count_nc = summary_list.filter((c) => c.comply === "NC").length

                const percent_c = count_all > 0 ? ((count_c * 100) / count_all).toFixed(2) : 0;
                const percent_nc = count_all > 0 ? ((count_nc * 100) / count_all).toFixed(2) : 0;

                // เพิ่มบรรทัดสรุป
                summary_row = `
                    <tr>
                        <td>รวม ${count_all} เรื่อง</td>
                        <td colspan="2">ดำเนินการตามกำหนด ${count_c} เรื่อง</td>
                        <td colspan="11">คิดเป็น ${percent_c} %</td>
                    </tr>
                    <tr>
                        <td></td>
                        <td colspan="2">ดำเนินการไม่ตามกำหนด ${count_nc} เรื่อง</td>
                        <td colspan="11">คิดเป็น ${percent_nc} %</td>
                    </tr>
                `

                table_layout = `
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">Agent Group</th>
                                <th rowspan="2">Task Owner</th>
                                <th rowspan="2">เลขที่ Change (task id)</th>
                                <th rowspan="2">Priority Change</th>
                                <th rowspan="2">OLA Complete within (Hardcode)</th>
                                <th rowspan="2">Report Date</th>
                                <th rowspan="2">Summary</th>
                                <th rowspan="2">Target Start</th>
                                <th rowspan="2">Target Finish</th>
                                <th rowspan="2">Actual Start</th>
                                <th rowspan="2">Actual Finish</th>
                                <th rowspan="2">Due Date</th>
                                <th rowspan="2">Comply</th>
                                <th colspan="3">ระยะเวลาดำเนินการ</th>
                            </tr>
                            <tr>
                                <th>วัน</th>
                                <th>ชั่วโมง</th>
                                <th>นาที</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${ticket_row}
                        </tbody>
                        <tfoot>
                        ${summary_row}
                        </tfoot>
                    </table>
                `
                // ออก ตาราง
                report.innerHTML += `${table_layout}`

            }

        })

    }    
}






// GENERATE REPORT (BACKUP)
// async function generateReport(list) {
//     let report = document.querySelector('.ctn-report')

//     let ticket_row = ''

//     if (list.length > 0) {
//         list.forEach((i) => {
            
//             ticket_row += `
//                 <tr>
//                     <td>${i.group_value || ''}</td>
//                     <td>${i.agent_value || ''}</td>
//                     <td>${i.parent_ticket_id} (${i.id})</td>
//                     <td>${i.parent_ticket_priority_value}</td>
//                     <td>${i.parent_ticket_ola}</td>
//                     <td>${i.local_parent_created_at}</td>
//                     <td>${i.title}</td>
//                     <td>${i.local_planned_start_date}</td>
//                     <td>${i.local_planned_end_date}</td>
//                     <td>${i.local_created_at}</td>
//                     <td>${i.local_closed_at}</td>
//                     <td>${i.local_due_date}</td>
//                     <td>${i.comply}</td>
//                     <td>${i.completed_duration_day}</td>
//                     <td>${i.completed_duration_hour}</td>
//                     <td>${i.completed_duration_minute}</td>
//                 </tr>
//             `
//         })
//     }

//     let table_layout = `
//         <table>
//             <thead>
//                 <tr>
//                     <th rowspan="2">Agent Group</th>
//                     <th rowspan="2">Task Owner</th>
//                     <th rowspan="2">เลขที่ Change (task id)</th>
//                     <th rowspan="2">Priority Change</th>
//                     <th rowspan="2">OLA Complete within (Hardcode)</th>
//                     <th rowspan="2">Report Date</th>
//                     <th rowspan="2">Summary</th>
//                     <th rowspan="2">Target Start</th>
//                     <th rowspan="2">Target Finish</th>
//                     <th rowspan="2">Actual Start</th>
//                     <th rowspan="2">Actual Finish</th>
//                     <th rowspan="2">Due Date</th>
//                     <th rowspan="2">Comply</th>
//                     <th colspan="3">ระยะเวลาดำเนินการ</th>
//                 </tr>
//                 <tr>
//                     <th>วัน</th>
//                     <th>ชั่วโมง</th>
//                     <th>นาที</th>
//                 </tr>
//             </thead>
//             <tbody>
//             ${ticket_row}
//             </tbody>
//         </table>
//     `

//     // ออก report
//     report.innerHTML += `${table_layout}`
// }